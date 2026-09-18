import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";

/** Une légende unique, les valeurs au survol et au tableau. */
export function essentialChart(option: EChartsOption, tokens: ChartTokens): EChartsOption {
  const series = (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []);
  return {
    ...option,
    grid: { ...(Array.isArray(option.grid) ? option.grid[0] : option.grid), right: 24, top: 54 },
    legend: { show: false },
    series: series.map((item) => ({ ...item, label: { show: false },
      endLabel: { show: false }, areaStyle: undefined })) as EChartsOption["series"],
  };
}
