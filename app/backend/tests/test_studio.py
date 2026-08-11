from __future__ import annotations

import asyncio
import unittest
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from openpyxl import load_workbook

from app.analysis import ExtractionRequest, FilterPayload, extraction_preview
from app.csp import CspExtractionRequest, CspOverviewRequest, csp_extraction_preview, csp_metadata, csp_overview
from app.main import REGIONS, csp_extraction_xlsx, extraction_xlsx, pathologies_extraction_xlsx, repository
from app.pathologies import (
    PathologyExtractionRequest,
    PathologyOverviewRequest,
    pathology_extraction_preview,
    pathology_metadata,
    pathology_overview,
)
from app.studio import WorkbenchRequest, run_workbench


class StudioTests(unittest.TestCase):
    def assert_amount_equal(self, actual: float, expected: float) -> None:
        self.assertAlmostEqual(actual, expected, delta=max(abs(expected) * 1e-12, 1e-6))

    def test_repository_supports_parallel_readers(self) -> None:
        def total_for_year(year: int) -> float:
            row = repository.query(
                "SELECT SUM(rem)::DOUBLE AS value FROM cube WHERE soi_ann = ?",
                [year],
            )[0]
            return float(row["value"] or 0)

        years = [2021, 2022, 2023, 2024]
        with ThreadPoolExecutor(max_workers=4) as executor:
            parallel = list(executor.map(total_for_year, years))
        sequential = [total_for_year(year) for year in years]

        for actual, expected in zip(parallel, sequential):
            self.assert_amount_equal(actual, expected)

    def test_previous_period_means_latest_year_against_previous_year(self) -> None:
        request = WorkbenchRequest(
            start_year=2019,
            end_year=2024,
            question="comparison",
            comparator="previous_period",
            measure="reimbursed",
        )
        result = run_workbench(repository, request, REGIONS)
        direct = repository.query(
            """SELECT soi_ann AS year, SUM(rem)::DOUBLE AS value
               FROM cube WHERE soi_ann IN (2023, 2024) GROUP BY 1 ORDER BY 1"""
        )
        expected = {int(row["year"]): float(row["value"] or 0) for row in direct}

        self.assertEqual(result["summary"]["label_a"], "2024")
        self.assertEqual(result["summary"]["label_b"], "2023")
        self.assertEqual(result["title"], "2024 / 2023")
        self.assert_amount_equal(result["summary"]["value_a"], expected[2024])
        self.assert_amount_equal(result["summary"]["value_b"], expected[2023])

    def test_transformed_evolution_table_does_not_recompute_a_second_change(self) -> None:
        request = WorkbenchRequest(
            start_year=2022,
            end_year=2024,
            question="evolution",
            display="change",
            measure="reimbursed",
        )
        result = run_workbench(repository, request, REGIONS)

        self.assertEqual([column["key"] for column in result["table"]["columns"]], ["period", "value"])
        self.assertEqual([row["period"] for row in result["table"]["rows"]], [2023, 2024])
        self.assertEqual(result["unit"], "percent")

    def test_quantity_is_available_on_the_full_scope(self) -> None:
        request = WorkbenchRequest(
            start_year=2023,
            end_year=2024,
            question="evolution",
            measure="quantity",
        )
        result = run_workbench(repository, request, REGIONS)
        direct = repository.query(
            "SELECT SUM(qte)::DOUBLE AS value FROM cube WHERE soi_ann = 2024"
        )[0]

        self.assert_amount_equal(result["summary"]["value_a"], float(direct["value"]))

    def test_average_reimbursed_is_a_ratio_not_a_sum_of_yearly_averages(self) -> None:
        request = WorkbenchRequest(
            start_year=2023,
            end_year=2024,
            question="evolution",
            measure="average_reimbursed",
        )
        result = run_workbench(repository, request, REGIONS)
        direct = repository.query(
            """SELECT SUM(rem)::DOUBLE / NULLIF(SUM(qte), 0) AS value
               FROM cube WHERE soi_ann = 2024""",
        )[0]

        self.assertEqual(result["summary"]["label_a"], "2024")
        self.assert_amount_equal(result["summary"]["value_a"], float(direct["value"]))
        self.assertIn("coût par patient", " ".join(result["warnings"]))

    def test_average_expense_is_available_without_a_service_filter(self) -> None:
        result = run_workbench(repository, WorkbenchRequest(
            start_year=2024,
            end_year=2024,
            question="evolution",
            measure="average_expense",
        ), REGIONS)
        direct = repository.query(
            """SELECT SUM(dep)::DOUBLE / NULLIF(SUM(qte), 0) AS value
               FROM cube WHERE soi_ann = 2024"""
        )[0]

        self.assert_amount_equal(result["summary"]["value_a"], float(direct["value"]))

    def test_true_comparison_rejects_two_different_measures(self) -> None:
        request = WorkbenchRequest(
            start_year=2023,
            end_year=2024,
            question="comparison",
            comparator="custom",
            measure="reimbursed",
            reference_measure="expense",
            reference=FilterPayload(start_year=2023, end_year=2024),
        )

        with self.assertRaisesRegex(ValueError, "même mesure"):
            run_workbench(repository, request, REGIONS)

    def test_juxtaposition_keeps_real_values_when_units_match(self) -> None:
        result = run_workbench(repository, WorkbenchRequest(
            start_year=2022,
            end_year=2024,
            question="juxtaposition",
            measure="reimbursed",
            reference_measure="expense",
            reference=FilterPayload(start_year=2022, end_year=2024),
            comparison_display="index",
        ), REGIONS)

        self.assertEqual(result["unit"], "money")
        self.assertEqual(result["comparison_display"], "raw")
        self.assertEqual(result["series"][0]["unit_key"], "eur_total")
        self.assertEqual(result["series"][1]["unit_key"], "eur_total")
        self.assertNotEqual(result["series"][0]["points"][0]["y"], 100)
        self.assertNotEqual(result["series"][1]["points"][0]["y"], 100)
        column_keys = [column["key"] for column in result["table"]["columns"]]
        self.assertNotIn("delta", column_keys)
        self.assertNotIn("delta_pct", column_keys)
        self.assertNotIn("index_a", column_keys)

    def test_juxtaposition_uses_base_100_when_units_differ(self) -> None:
        result = run_workbench(repository, WorkbenchRequest(
            start_year=2022,
            end_year=2024,
            question="juxtaposition",
            measure="reimbursed",
            reference_measure="coverage",
            reference=FilterPayload(start_year=2022, end_year=2024),
        ), REGIONS)

        self.assertEqual(result["unit"], "index")
        self.assertEqual(result["comparison_display"], "index")
        self.assertAlmostEqual(result["series"][0]["points"][0]["y"], 100)
        self.assertAlmostEqual(result["series"][1]["points"][0]["y"], 100)
        column_keys = [column["key"] for column in result["table"]["columns"]]
        self.assertIn("value_a", column_keys)
        self.assertIn("value_b", column_keys)
        self.assertIn("index_a", column_keys)
        self.assertIn("index_b", column_keys)

    def test_calculator_recomputes_a_non_additive_metric_on_full_scope(self) -> None:
        result = run_workbench(repository, WorkbenchRequest(
            start_year=2023,
            end_year=2024,
            question="calculator",
            measure="average_reimbursed",
            dimension="year",
        ), REGIONS)
        direct = repository.query(
            """SELECT SUM(rem)::DOUBLE / NULLIF(SUM(qte), 0) AS value
               FROM cube WHERE soi_ann BETWEEN 2023 AND 2024"""
        )[0]

        self.assertFalse(result["additive"])
        self.assertEqual(result["unit_key"], "eur_per_unit")
        self.assertEqual(len(result["table"]["rows"]), 2)
        self.assert_amount_equal(result["summary"]["value_a"], float(direct["value"]))

    def test_decomposition_contributions_reconcile_with_total_gap(self) -> None:
        request = WorkbenchRequest(
            start_year=2020,
            end_year=2024,
            question="decomposition",
            decomposition_basis="change",
            comparator="previous_period",
            measure="reimbursed",
            dimension="grand_post",
        )
        result = run_workbench(repository, request, REGIONS)
        row_delta = sum(float(row["delta"] or 0) for row in result["table"]["rows"])

        self.assert_amount_equal(row_delta, result["summary"]["delta"])

    def test_arbitrary_year_comparison_uses_selected_years(self) -> None:
        result = run_workbench(repository, WorkbenchRequest(
            start_year=2019,
            end_year=2024,
            question="comparison",
            comparator="years",
            comparison_year_a=2024,
            comparison_year_b=2021,
            measure="expense",
        ), REGIONS)

        self.assertEqual(result["title"], "2024 / 2021")
        self.assertEqual([bar["label"] for bar in result["bars"]], ["2024", "2021"])

    def test_region_comparison_accepts_more_than_two_regions(self) -> None:
        result = run_workbench(repository, WorkbenchRequest(
            start_year=2023,
            end_year=2024,
            question="comparison",
            comparator="regions",
            comparison_regions=[11, 84, 93],
            measure="reimbursed",
        ), REGIONS)

        self.assertEqual(len(result["series"]), 3)
        self.assertEqual(len(result["table"]["columns"]), 4)

    def test_excel_export_contains_data_and_metadata_sheets(self) -> None:
        response = extraction_xlsx(ExtractionRequest(
            start_year=2024,
            end_year=2024,
            dimensions=["year"],
            measures=["reimbursed"],
        ))

        async def response_bytes() -> bytes:
            return b"".join([chunk async for chunk in response.body_iterator])

        workbook = load_workbook(BytesIO(asyncio.run(response_bytes())), read_only=True)
        self.assertEqual(workbook.sheetnames, ["Données", "Métadonnées"])
        self.assertEqual(workbook["Données"]["A1"].value, "Année de soins")
        self.assertEqual(workbook["Données"]["B1"].value, "Montant remboursé")
        self.assertEqual(workbook["Données"]["B2"].number_format, "#,##0")
        self.assertEqual(workbook["Métadonnées"]["A1"].value, "Élément")
        self.assertEqual(workbook["Métadonnées"]["A2"].value, "Source")
        metadata_values = {row[0].value: row[1].value for row in workbook["Métadonnées"].iter_rows()
                           if len(row) >= 2 and row[0].value}
        self.assertEqual(metadata_values["Dimensions"], "Année de soins")
        self.assertEqual(metadata_values["Mesures"], "Montant remboursé")

    def test_pathology_overview_exposes_identity_profiles_and_territories(self) -> None:
        metadata = pathology_metadata(repository)
        diabetes = next(
            pathology
            for family in metadata["families"]
            for group in family["groups"]
            for pathology in [{"code": group["code"], "label": group["label"]}, *group["pathologies"]]
            if "diab" in pathology["label"].lower()
        )
        overview = pathology_overview(repository, PathologyOverviewRequest(
            top=diabetes["code"],
            year=metadata["default_year"],
        ))

        self.assertEqual(len(overview["kpis"]), 4)
        self.assertGreater(len(overview["annual"]), 1)
        self.assertGreater(len(overview["age_sex"]), 1)
        self.assertGreater(len(overview["territories"]), 1)
        self.assertGreater(overview["kpis"][0]["value"], 0)
        self.assertIn("femme pour 1 homme", overview["kpis"][3]["detail"])
        self.assertNotIn(",0 femme", overview["kpis"][3]["detail"])
        self.assertEqual(metadata["levels"], 3)
        self.assertTrue(any(group["pathologies"] for family in metadata["families"] for group in family["groups"]))

    def test_pathology_overview_applies_population_filters(self) -> None:
        overview = pathology_overview(repository, PathologyOverviewRequest(
            top="DIA_CAT_CAT",
            year=2024,
            region="11",
            age="60-64",
            sex="femmes",
        ))
        direct = repository.query(
            """SELECT ntop::DOUBLE AS patients FROM pathologies
               WHERE top = 'DIA_CAT_CAT' AND year(annee) = 2024 AND dept = '999'
                 AND region = '11' AND cla_age_5 = '60-64' AND libelle_sexe = 'femmes'"""
        )[0]

        self.assert_amount_equal(overview["kpis"][0]["value"], float(direct["patients"]))
        self.assertEqual(overview["context"]["region"], "11")
        self.assertEqual(overview["context"]["age"], "60-64")
        self.assertEqual(overview["context"]["sex"], "femmes")

    def test_masked_pathology_prevalence_is_never_replaced_by_zero(self) -> None:
        overview = pathology_overview(repository, PathologyOverviewRequest(
            top="TAA_CAT_EXC",
            year=2024,
            age="85-89",
            sex="tous sexes",
        ))
        missing = [item for item in overview["territories"] if item["prevalence"] is None]

        self.assertTrue(missing)
        self.assertEqual(overview["quality"]["unavailable_territories"], len(missing))
        self.assertTrue(all(item["patients"] is None for item in missing))

    def test_pathology_extraction_uses_requested_dimensions_and_measures(self) -> None:
        metadata = pathology_metadata(repository)
        selected = metadata["families"][0]
        preview = pathology_extraction_preview(repository, PathologyExtractionRequest(
            top=selected["code"],
            start_year=metadata["default_year"],
            end_year=metadata["default_year"],
            dimensions=["year", "sex", "region"],
            measures=["patients", "prevalence"],
            limit=100,
        ))

        self.assertEqual(
            [column["key"] for column in preview["columns"]],
            ["year", "sex", "region", "patients", "prevalence"],
        )
        self.assertGreater(preview["total_rows"], 0)
        self.assertTrue(preview["rows"])

    def test_average_measure_is_available_in_full_scope_extractions(self) -> None:
        preview = extraction_preview(repository, ExtractionRequest(
            start_year=2024,
            end_year=2024,
            dimensions=["year"],
            measures=["average_reimbursed"],
        ), REGIONS)
        direct = repository.query(
            """SELECT SUM(rem)::DOUBLE / NULLIF(SUM(qte), 0) AS value
               FROM cube WHERE soi_ann = 2024"""
        )[0]

        self.assert_amount_equal(float(preview["rows"][0]["average_reimbursed"]), float(direct["value"]))

    def test_pathology_excel_export_keeps_numeric_formats_and_metadata(self) -> None:
        metadata = pathology_metadata(repository)
        selected = metadata["families"][0]
        response = pathologies_extraction_xlsx(PathologyExtractionRequest(
            top=selected["code"],
            start_year=metadata["default_year"],
            end_year=metadata["default_year"],
            dimensions=["year", "region"],
            measures=["patients", "prevalence"],
        ))

        async def response_bytes() -> bytes:
            return b"".join([chunk async for chunk in response.body_iterator])

        workbook = load_workbook(BytesIO(asyncio.run(response_bytes())), read_only=True)
        self.assertEqual(workbook.sheetnames, ["Données", "Métadonnées"])
        self.assertEqual(workbook["Données"]["C2"].number_format, "#,##0")
        self.assertEqual(workbook["Données"]["D2"].number_format, "0.0")
        self.assertEqual(workbook["Métadonnées"]["A2"].value, "Source")
        metadata_values = {row[0].value: row[1].value for row in workbook["Métadonnées"].iter_rows()
                           if len(row) >= 2 and row[0].value}
        self.assertEqual(metadata_values["Dimensions"], "Année, Région")
        self.assertEqual(metadata_values["Mesures"], "Patients, Prévalence")

    def test_csp_metadata_exposes_both_levels_and_all_regions(self) -> None:
        metadata = csp_metadata(repository)

        levels = {item["key"]: item for item in metadata["levels"]}
        self.assertEqual(metadata["years"], list(range(2015, 2024)))
        self.assertEqual(len(levels["groupe_6"]["options"]), 6)
        self.assertEqual(len(levels["categorie_29"]["options"]), 29)
        self.assertEqual(len(metadata["regions"]), 18)  # France + 17 régions
        self.assertLess(metadata["core_size_bytes"], 15_000_000)

    def test_csp_overview_reconciles_with_the_optimized_parquet(self) -> None:
        result = csp_overview(repository, CspOverviewRequest(
            level="groupe_6", csp_code="3", region="FR", age="all", sex=0,
        ))
        direct = repository.query(
            """SELECT SUM(effectif)::DOUBLE AS population,
                      SUM(CASE WHEN code_csp = '3' THEN effectif ELSE 0 END)::DOUBLE AS selected
                 FROM csp WHERE annee = 2023 AND niveau_csp = 'groupe_6'"""
        )[0]

        self.assert_amount_equal(result["kpis"][0]["value"], float(direct["population"]))
        self.assert_amount_equal(result["kpis"][1]["value"], float(direct["selected"]))
        self.assertEqual(len(result["territories"]), 17)
        self.assertEqual(len(result["composition"]), 6)
        self.assertEqual(len(result["age_sex"]), 16)

    def test_csp_population_filters_change_the_denominator(self) -> None:
        metadata = csp_metadata(repository)
        age = metadata["ages"][3]["code"]
        result = csp_overview(repository, CspOverviewRequest(
            level="categorie_29", csp_code="38", region="11", age=age, sex=2,
        ))
        direct = repository.query(
            """SELECT SUM(effectif)::DOUBLE AS population,
                      SUM(CASE WHEN code_csp = '38' THEN effectif ELSE 0 END)::DOUBLE AS selected
                 FROM csp
                WHERE annee = 2023 AND niveau_csp = 'categorie_29'
                  AND code_region = '11' AND tranche_age = ? AND code_sexe = 2""",
            [age],
        )[0]

        self.assert_amount_equal(result["kpis"][0]["value"], float(direct["population"]))
        self.assert_amount_equal(result["kpis"][1]["value"], float(direct["selected"]))
        self.assertEqual(result["context"]["region"], "11")
        self.assertEqual(result["context"]["sex"], 2)

    def test_csp_extraction_and_excel_are_documented(self) -> None:
        request = CspExtractionRequest(
            level="categorie_29", csp_code="38",
            dimensions=["region", "age", "sex"],
            measures=["effectif", "population", "share"],
        )
        preview = csp_extraction_preview(repository, request)
        self.assertEqual([column["key"] for column in preview["columns"]],
                         ["region", "age", "sex", "effectif", "population", "share"])
        expected_rows = repository.query(
            """SELECT COUNT(*) AS value FROM (
                   SELECT region, tranche_age, sexe
                     FROM csp
                    WHERE annee = 2023 AND niveau_csp = 'categorie_29'
                    GROUP BY region, tranche_age, sexe
               )"""
        )[0]["value"]
        self.assertEqual(preview["total_rows"], expected_rows)
        self.assertTrue(any(float(row["effectif"]) == 0 for row in preview["rows"]))

        response = csp_extraction_xlsx(request)

        async def response_bytes() -> bytes:
            return b"".join([chunk async for chunk in response.body_iterator])

        workbook = load_workbook(BytesIO(asyncio.run(response_bytes())), read_only=True)
        self.assertEqual(workbook.sheetnames, ["Données", "Métadonnées"])
        self.assertEqual(workbook["Données"]["D2"].number_format, "#,##0")
        self.assertEqual(workbook["Données"]["F2"].number_format, "0.00")
        metadata_values = {row[0].value: row[1].value for row in workbook["Métadonnées"].iter_rows()
                           if len(row) >= 2 and row[0].value}
        self.assertEqual(metadata_values["Champ"], "Actifs ayant un emploi (TACT = 11)")
        self.assertIn("29 catégories", metadata_values["Niveau CSP"])


if __name__ == "__main__":
    unittest.main()
