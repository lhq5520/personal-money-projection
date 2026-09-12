/**
 * 中国省级社保缴费基数的驱动值。
 *
 * ## 为什么按省而不按市
 *
 * 社保缴费基数是**省级统筹**的：同一省内各市共用同一个「全口径城镇单位就业人员
 * 月平均工资」，上下限由它按法定的 60% / 300% 推导。所以真正需要维护的是
 * 21 个省级数字，而不是 34 个城市数字——南京、苏州、无锡用的是同一个江苏省的值。
 *
 * 少数城市另有市级规定（深圳/广州的医保按市级统筹、公积金按本市口径），
 * 在 cities.ts 里用 `bases` 逐险种覆盖。
 *
 * ## 生效期并不统一
 *
 * 多数省份的社保年度是 7 月 1 日至次年 6 月 30 日，但：
 *   - 安徽、黑龙江按自然年（1 月 1 日起）
 *   - 浙江分上下半年两段，这里取下半年的值
 * 所以每个省单独记录自己的适用期，不能统一假设。
 *
 * ## 数据来源
 *
 * 各省人社厅的年度公告。中国没有可用的官方接口
 * （国家统计局 easyquery 对自动化访问返回 403），
 * 靠 `pnpm data:check` 做变更检测 + 人工核对，见 scripts/check-sources.ts；
 * 过期由 `pnpm data:audit` 负责报警。
 */

import type { Provenance } from '../../data/provenance.js';
import { cnSocialYear, calendarYear } from '../../data/provenance.js';
import type { LocalizedName } from '../types.js';

export interface ProvinceBase {
  code: string;
  name: LocalizedName;
  /** 全口径城镇单位就业人员月平均工资；上下限按 60% / 300% 推导 */
  avgWage: number;
  provenance: Provenance;
}

const VERIFIED_AT = '2026-09-12';

/** 多数省份：2026 社保年度（2026-07-01 ~ 2027-06-30） */
const sy2026 = (note: string): Provenance => ({
  ...cnSocialYear(2026),
  verifiedAt: VERIFIED_AT,
  confidence: 'verified',
  note,
});

/** 安徽、黑龙江等按自然年执行的省份 */
const cy2026 = (note: string): Provenance => ({
  ...calendarYear(2026),
  verifiedAt: VERIFIED_AT,
  confidence: 'verified',
  note,
});

/** 由公布的上限反推社平：上限 = 社平 × 300% */
const fromCeiling = (ceiling: number): number => Math.round(ceiling / 3);

const p = (
  code: string,
  zh: string,
  en: string,
  ceiling: number,
  provenance: Provenance,
): ProvinceBase => ({
  code,
  name: { zh, en },
  avgWage: fromCeiling(ceiling),
  provenance,
});

export const CN_PROVINCES: readonly ProvinceBase[] = [
  // ---- 直辖市：各自独立统筹 ----
  {
    code: 'shanghai',
    name: { zh: '上海', en: 'Shanghai' },
    avgWage: 12_577,
    provenance: sy2026('2025 年度全口径社平 12,577 元/月，上下限 7,546 / 37,731，2026-08-18 公布'),
  },
  {
    code: 'beijing',
    name: { zh: '北京', en: 'Beijing' },
    avgWage: 12_116,
    provenance: sy2026('上下限 7,270 / 36,348，2026-08-21 公布'),
  },
  p('tianjin', '天津', 'Tianjin', 25_620, sy2026('上下限 5,124 / 25,620')),
  p('chongqing', '重庆', 'Chongqing', 22_250, sy2026('上下限 4,450 / 22,250')),

  // ---- 各省 ----
  p('guangdong', '广东', 'Guangdong', 27_549, sy2026('养老按省级统筹，上下限 5,510 / 27,549；医保各市另行统筹')),
  p('jiangsu', '江苏', 'Jiangsu', 24_762, sy2026('上下限 4,952 / 24,762')),
  p('zhejiang', '浙江', 'Zhejiang', 26_730, {
    // 浙江把一年拆成两段执行，这里取下半年的值
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-12-31',
    verifiedAt: VERIFIED_AT,
    confidence: 'verified',
    note: '浙江分上下半年执行：上半年 4,986 / 25,299，下半年 5,346 / 26,730。此处取下半年值',
  }),
  p('sichuan', '四川', 'Sichuan', 23_493, sy2026('上下限 4,699 / 23,493')),
  p('hubei', '湖北', 'Hubei', 22_488, sy2026('湖北分三档，此处为第 1 档（武汉市与省直）：4,498 / 22,488')),
  p('shaanxi', '陕西', 'Shaanxi', 23_685, sy2026('上下限 4,737 / 23,685')),
  p('henan', '河南', 'Henan', 19_155, sy2026('上下限 3,831 / 19,155')),
  p('shandong', '山东', 'Shandong', 22_863, sy2026('上下限 4,573 / 22,863')),
  p('shanxi', '山西', 'Shanxi', 21_219, sy2026('上下限 4,244 / 21,219')),
  p('hunan', '湖南', 'Hunan', 20_529, sy2026('缴费基准值 6,843，上下限 4,106 / 20,529')),
  p('liaoning', '辽宁', 'Liaoning', 22_665, sy2026('上下限 4,533 / 22,665')),
  p('fujian', '福建', 'Fujian', 22_893, sy2026('上下限 4,579 / 22,893；医保 7 月先行，养老失业工伤 8 月 1 日起')),
  p('hebei', '河北', 'Hebei', 20_382, sy2026('上下限 4,076 / 20,382')),
  p('jilin', '吉林', 'Jilin', 22_180, sy2026('上下限 4,436 / 22,180')),
  p('gansu', '甘肃', 'Gansu', 22_626, sy2026('上下限 4,526 / 22,626')),
  p('guangxi', '广西', 'Guangxi', 21_225, sy2026('上下限 4,245 / 21,225')),
  p('guizhou', '贵州', 'Guizhou', 21_300, sy2026('上下限 4,260 / 21,300')),
  p('yunnan', '云南', 'Yunnan', 22_140, sy2026('上下限 4,428 / 22,140')),
  p('anhui', '安徽', 'Anhui', 21_772, cy2026('按自然年执行：上下限 4,354 / 21,772，2026-01-01 起')),
  p('heilongjiang', '黑龙江', 'Heilongjiang', 23_115, cy2026('按自然年执行：上下限 4,623 / 23,115，2026-01-01 起')),

  // ---- 尚未公布 2026 年度值 ----
  {
    code: 'jiangxi',
    name: { zh: '江西', en: 'Jiangxi' },
    // 2024 年度公布值 3,839 / 19,191 反推社平 6,397
    avgWage: 6_397,
    provenance: {
      ...cnSocialYear(2024),
      verifiedAt: VERIFIED_AT,
      // 数值本身是官方公布的真实值，只是期次旧——不是估算。
      // 所以标 verified，由适用期负责让它显示为「已过期」。
      confidence: 'verified',
      note: '2024 年度上下限 3,839 / 19,191。江西省截至核对日尚未公布 2026 年度基数，请留意该省人社厅公告',
    },
  },
];

export function getProvince(code: string): ProvinceBase {
  return CN_PROVINCES.find((x) => x.code === code) ?? CN_PROVINCES[0]!;
}
