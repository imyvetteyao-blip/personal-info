# Waters ACQUITY UPLC + Xevo TQ-S micro 系统学习资源全集

---

## 一、仪器和系统总览

### 核心文件

| 文件名 | 来源 | 链接 | 用途 |
|--------|------|------|------|
| Xevo TQ-S micro Overview and Maintenance Guide (715004599 v04, ~264页) | Waters 官方 | https://www.waters.com/webassets/cms/support/docs/715004599v04.pdf | 最核心参考手册：系统规格、操作模式（ESI/APCI/APPI）、启动关机、换源、全套维护程序 |
| ACQUITY UPLC–Xevo Tandem Quadrupole Systems Familiarization Guide (715007535 v02, 2024) | Waters 官方 | https://help.waters.com/content/dam/waters/en/support/familiarizationguide/2024/715007535/715007535v02.pdf | **新手首选**：MassLynx 概览、UPLC+TQ 联用系统入门、标准操作流程 |
| ACQUITY UPLC I-Class / Xevo TQ-S micro IVD System Guide (715004986IVD) | Waters 官方 | https://help.waters.com/content/dam/waters/fr/support/usermanuals/2015/715004986IVD/715004986ivdra.pdf | 完整系统说明：BSM、样品管理器、柱温箱、MS 的整合描述 |
| Xevo TQ-S micro Site Preparation Guide (715004573 v13, 29页) | Waters 官方 | https://help.waters.com/content/dam/waters/en/support/sitepreparationguides/2024/715004573/715004573v13.pdf | 安装环境要求：氮气规格、电力、通风、尺寸 |
| Introduction to LC-MS/MS technique（讲义 PPT，2025 年 3 月） | Waters HK / 澳門大學 | https://sklmqcm.um.edu.mo/wp-content/uploads/2025/03/UoM_LCMSMS_20250319.pdf | LC-MS/MS 原理概览，适合理解系统构成 |

### 概念视频（系统原理）

| 视频 | 时长 | 链接 |
|------|------|------|
| Fundamentals of MS 1/7 — Electrospray Ionisation | ~4 min | https://videos.waters.com/detail/video/5752708141001/fundamentals-of-ms-1-of-7---electrospray-ionisation |
| Fundamentals of MS 4/7 — Quadrupoles | ~4 min | https://videos.waters.com/detail/video/5752710232001/fundamentals-of-ms-4-of-7---quadrupoles |
| Fundamentals of MS 7/7 — Fragmentation | ~4 min | https://videos.waters.com/detail/video/5752710433001/fundamentals-of-ms-7-of-7---fragmentation |
| Mass Spec Fundamentals Part 1: Ion Sources（长视频） | 57:22 | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/6093254743001/mass-spectrometry-fundamentals-part-1-of-3-:-ion-sources |
| Mass Spec Fundamentals Part 2: Mass Analyzers and Detectors | 56:24 | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/6093255388001/mass-spectrometry-fundamentals-part-2-of-3-:-mass-analyzers-and-detectors |

---

## 二、日常开机和关机

### 核心文件

| 文件名 | 链接 | 覆盖内容 |
|--------|------|---------|
| Xevo TQ-S micro Overview & Maintenance Guide（第 3–4 章） | https://www.waters.com/webassets/cms/support/docs/715004599v04.pdf | 标准启动顺序、气体设置、Standby/Operate 模式切换、安全关机 |
| ACQUITY UPLC Familiarization Guide (2024) | https://help.waters.com/content/dam/waters/en/support/familiarizationguide/2024/715007535/715007535v02.pdf | UPLC 开机顺序、MassLynx/Mass Console 状态检查 |
| Xevo TQ-S micro Recommended Operating Range Settings (715008287 v01) | https://help.waters.com/content/dam/waters/en/support/usermanuals/2022/715008287/715008287v01.pdf | Source temperature、desolvation gas、cone voltage 等推荐范围 |
| KB: How to shut down a Xevo TQ-S | https://support.waters.com/KB_Inst/Mass_Spectrometry/WKB29694_How_to_shutdown_a_Xevo_TQ-S | 关机步骤 |
| KB: Full system restart on Xevo TQ-S micro | https://support.waters.com/KB_Inst/Mass_Spectrometry/WKB14924_Xevo_TQS_micro_How_to_override_pump_and_Reset_MS_correct | 紧急重启 / 真空泵 override |

---

## 三、MassLynx 软件操作

### 核心文件

| 文件名 | 链接 | 用途 |
|--------|------|------|
| MassLynx 4.2 Getting Started Guide (715009602 v00, 2025年7月) | https://help.waters.com/content/dam/waters/en/support/usermanuals/2025/715009602/715009602v00.pdf | **最新版入门**：创建 project、设置 acquisition method、采集数据、处理数据 |
| MassLynx 4.1 Getting Started Guide (71500113203ra) | https://www.waters.com/webassets/cms/support/docs/71500113203ra.pdf | 4.1 版同类文件，多数仪器仍使用此版 |
| MassLynx 4.2 Installation and Configuration Guide (715009137 v01) | https://help.waters.com/content/dam/waters/de/support/usermanuals/2024/715009137/715009137v01.pdf | 软件安装、仪器连接配置 |
| MassLynx Software Support Solutions（在线文档中心） | https://help.waters.com/help/en/product-support/masslynx-software-support-solutions.html | MassLynx 全部文档、按版本整理 |
| Purdue University UPLC Training Guide（11页，2025年3月） | https://www.chem.purdue.edu/ric/docs/waters-lcms-training-guide.pdf | 实验室实际操作步骤，含 MassLynx 启动和 Inlet Method 设置 |

### 视频

| 视频 | 来源 | 链接 | 重点内容 |
|------|------|------|---------|
| How to Operate LC-MS/MS Using Waters Instrument — MassLynx for Beginners | YouTube | https://www.youtube.com/watch?v=pgwVyghTrVA | **强烈推荐**：MassLynx 实际界面操作演示 |
| How to Prepare a Sequence on Waters LC-MS/MS (Step-by-Step) | YouTube | https://www.youtube.com/watch?v=1zISzpjwsCc | Sample list / sequence 建立全流程 |
| Masslynx Instruction Part 1 | YouTube | https://www.youtube.com/watch?v=Logky0Nejus | 新建 project、项目结构 |
| Masslynx Instruction Part 2 | YouTube | https://www.youtube.com/watch?v=6pJGJWOVrVQ | Part 1 延续 |
| MassLynx Features for Simplifying MRM Method Development | Waters | https://videos.waters.com/detail/video/6204162194001/masslynx-features-for-simplifying-mrm-method-development | 11:17，MassLynx 内 MRM 方法功能演示 |

---

## 四、MRM 方法开发

### 核心文件

| 文件名 | 链接 | 用途 |
|--------|------|------|
| Method Development Guide for Quantitation Using waters_connect (715008152 v00) | https://help.waters.com/content/dam/waters/es/support/usermanuals/2022/715008152/715008152v00.pdf | **最实用的 MRM 开发指南**：起始参数、自动 MRM 优化、手动 tuning、source 优化、LC 优化、时间窗口 |
| Step-by-Step Guide for Compound Optimization on Xevo TQ-S micro（澳門大學，11页，2024） | https://sklmqcm.um.edu.mo/wp-content/uploads/2025/03/2024-Step-by-step-tune-guide-Xevo-TQ-S-micro.pdf | **最直接的 Xevo TQ-S micro tuning 手册**：MS1/MS2 优化、MRM transition 建立、IntelliStart 用法 |
| Xevo TQ-S micro Recommended Operating Range Settings | https://help.waters.com/content/dam/waters/en/support/usermanuals/2022/715008287/715008287v01.pdf | Cone voltage、collision energy 推荐范围表 |

### 视频

| 视频 | 来源 | 链接 | 时长/内容 |
|------|------|------|----------|
| Automatic MRM Optimization in the System Console | Waters | https://videos.waters.com/detail/video/6296737914001/automatic-mrm-optimization-in-the-system-console | 自动优化流程演示 |
| Manual MRM Optimization by Fluidics | Waters | https://videos.waters.com/detail/video/6308366481112/manual-mrm-optimization-by-fluidics | 手动优化：precursor tuning、product ion tuning |
| LC-MS/MS Education Series: Analyte Tuning | Waters/YouTube | https://www.youtube.com/watch?v=GJGceTWBgOo | 化合物 tuning 完整流程 |
| LC-MS/MS Education Series: Quadrupole Resolution and Mass Calibration | Waters/YouTube | https://www.youtube.com/watch?v=vkT0nrbeoDY | 质量校正与分辨率设置 |
| LC-MS/MS Method Development Part 4: MRM Time Segmentation | YouTube | https://www.youtube.com/watch?v=G-aKqqRAbKs | dwell time 和 retention window 设置 |

---

## 五、UPLC 方法设置

### 核心文件

| 文件名 | 链接 | 覆盖内容 |
|--------|------|---------|
| ACQUITY UPLC I-Class System Guide (715005704ra) | https://help.waters.com/content/dam/waters/en/support/usermanuals/2018/715005704/715005704ra.pdf | 流动相、进样量、梯度、流速、柱温箱、autosampler 设置 |
| ACQUITY UPLC H-Class System Guide (715005049rc) | https://help.waters.com/content/dam/waters/en/support/usermanuals/2016/715005049/715005049rc.pdf | 四元泵版本 UPLC 同类说明 |
| Purdue University Waters LCMS User Guide | https://www.chem.purdue.edu/ric/docs/Waters-LCMS-User-Guide.pdf | 实验室实操：包括 needle wash / seal wash 设置 |

---

## 六、TargetLynx / QuanLynx 数据处理

### 核心文件

| 文件名 | 链接 | 用途 |
|--------|------|------|
| KB: Where to find the TargetLynx user manual | https://support.waters.com/KB_Inf/MassLynx/WKB68798_Where_to_find_the_TargetLynx_user_manual | TargetLynx 手册位置（内置于 MassLynx Help 菜单） |
| KB: How to add a compound to a TargetLynx method | https://support.waters.com/KB_Inf/MassLynx/WKB125852_How_do_I_add_a_compound_to_a_TargetLynx_method_in_MassLynx | 向 TargetLynx method 添加化合物 |
| KB: How to process samples using a saved calibration curve in TargetLynx | https://support.waters.com/KB_Inf/MassLynx/WKB6187_How_to_process_samples_using_a_saved_calibration_curve_in_TargetLynx | 使用已保存标准曲线批量处理 |
| TargetLynx eLearning Track（付费课程） | https://www.waters.com/waters/educationInstance.htm?eiid=134718932&locale=en_US | TargetLynx 全模块：方法设置、数据处理、审核、高级用法 |

### 视频

| 视频 | 来源 | 链接 |
|------|------|------|
| Importing TargetLynx Methods and MassLynx Acquired Data | Waters | https://videos.waters.com/detail/video/6305128785001/importing-targetlynx-methods-and-masslynx-acquired-data |
| Importing MassLynx Acquisition Methods | Waters | https://videos.waters.com/detail/video/6294103092001/importing-masslynx-acquisition-methods |

---

## 七、日常维护

### 核心文件

| 文件名 | 链接 | 覆盖内容 |
|--------|------|---------|
| Xevo TQ-S micro Overview and Maintenance Guide (264页全手册) | https://www.waters.com/webassets/cms/support/docs/715004599v04.pdf | Source 清洁、sample cone / gas cone 清洁、capillary 维护、真空检查、泵油更换、tuning 和校准 |
| Installing the Tool-free Probe Assembly（视频） | Waters | https://videos.waters.com/detail/videos/xevo-systems/video/5718272542001/installing-the-tool-free-probe-assembly |
| How-to Episode 4: How to Improve Performance of LC-MS/MS Analyses | Waters | https://videos.waters.com/detail/videos/how-to-series/video/6192965666001/how-to-series-episode-4:-how-to-improve-performance-of-lc-ms-ms-analyses |
| How-to Episode 3: Assess and Compensate for Matrix Effects | Waters | https://videos.waters.com/detail/videos/how-to-series/video/6175747550001/how-to-series-episode-3:-assess-and-compensate-for-the-effect-of-matrix-on-lc-ms-ms-analyses |

---

## 八、视频资源完整汇总（20 分钟以上重点视频）

| 视频标题 | 来源 | 链接 | 时长 | 推荐用途 |
|----------|------|------|------|---------|
| Mass Spec Fundamentals Part 1: Ion Sources | Waters | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/6093254743001/mass-spectrometry-fundamentals-part-1-of-3-:-ion-sources | 57:22 | 理解 ESI 源、离子化原理 |
| Mass Spec Fundamentals Part 2: Mass Analyzers and Detectors | Waters | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/6093255388001/mass-spectrometry-fundamentals-part-2-of-3-:-mass-analyzers-and-detectors | 56:24 | 理解 quadrupole、collision cell、detector |
| Mass Spec Fundamentals Part 3: Advanced Topics | Waters | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/6093191723001/mass-spectrometry-fundamentals-part-3-of-3-:-advanced-topics-in-mass-spectrometry | 59:13 | 进阶理论（MRM、定量） |
| Fundamentals of Mass Detection Part 1: What Is Single Quadrupole MS? | Waters | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/5765900911001/fundamentals-of-mass-detection:-part-i---what-is-single-quadrupole-mass-spectrometry-and-how-is-it-used | 58:37 | 单四极杆原理（为 TQ 打基础） |
| Fundamentals of Mass Detection Part 2: Practical Tips for Coupling SQ MS with LC | Waters | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/5803675031001/fundamentals-of-mass-detection:-part-2---practical-tips-for-coupling-single-quadrupole-ms-with-liquid-chromatography | 60:36 | LC-MS 联用实战技巧 |
| Fundamentals of Mass Detection Part 3: Processing and Interpreting LC/MS Data | Waters | https://videos.waters.com/detail/videos/mass-spectrometry-fundamentals/video/5803677168001/fundamentals-of-mass-detection:-part-3---processing-and-interpreting-lc-ms-data | 65:20 | 数据处理与图谱解读 |

### 其他实用视频（10 分钟以内，但内容具体）

| 视频标题 | 链接 | 时长 | 用途 |
|----------|------|------|------|
| MassLynx Features for Simplifying MRM Method Development | https://videos.waters.com/detail/video/6204162194001/masslynx-features-for-simplifying-mrm-method-development | 11:17 | MassLynx MRM 方法建立 |
| How-to Episode 3: Matrix Effects | https://videos.waters.com/detail/videos/how-to-series/video/6175747550001/how-to-series-episode-3:-assess-and-compensate-for-the-effect-of-matrix-on-lc-ms-ms-analyses | 12:41 | 基质效应处理 |
| How-to Episode 4: Improve LC-MS/MS Performance | https://videos.waters.com/detail/videos/how-to-series/video/6192965666001/how-to-series-episode-4:-how-to-improve-performance-of-lc-ms-ms-analyses | 11:02 | 性能优化排查 |
| LC-MS/MS Analyte Tuning | https://www.youtube.com/watch?v=GJGceTWBgOo | ~10 min | Tuning 全流程 |
| Installing Tool-free Probe Assembly | https://videos.waters.com/detail/videos/xevo-systems/video/5718272542001/installing-the-tool-free-probe-assembly | 3:49 | Probe 拆装 |

**视频主入口：**
- Waters 官方视频库：https://videos.waters.com
- Xevo 系统专区（47个视频）：https://videos.waters.com/category/videos/xevo-systems
- MassLynx 视频专区：https://videos.waters.com/category/videos/masslynx
- How-to 系列（235个视频）：https://videos.waters.com/category/videos/how-to-series
- MS Fundamentals 专区：https://videos.waters.com/category/videos/mass-spectrometry-fundamentals

---

## 推荐学习顺序

```
阶段 1：理论基础（1–2 周）
├── Waters MS Fundamentals 长视频系列（3 × ~57 min）
├── Fundamentals of MS 概念短片系列（7 × ~4 min）
└── Beginner's Guide to MS（网页）：
    https://www.waters.com/nextgen/us/en/education/primers/the-mass-spectrometry-primer.html

阶段 2：认识仪器（3–5 天）
├── Xevo TQ-S micro Overview & Maintenance Guide（重点读第 1–3 章）
├── ACQUITY UPLC Familiarization Guide（新手首选，读完全文）
└── 澳門大學 Compound Optimization Step-by-Step Guide（11页）

阶段 3：MassLynx 软件（3–5 天）
├── MassLynx 4.2 Getting Started Guide（PDF 全文）
├── YouTube：MassLynx for Beginners
└── YouTube：How to Prepare a Sequence

阶段 4：MRM 方法开发（1 周）
├── Method Development Guide for Quantitation（PDF 全文）
├── Waters 官方：Automatic MRM Optimization 视频
├── Waters 官方：Manual MRM Optimization 视频
└── YouTube：Analyte Tuning + MRM Time Segmentation

阶段 5：TargetLynx 数据处理（3–5 天）
├── TargetLynx 手册（MassLynx Help 菜单内置）
├── Waters 官方：Importing TargetLynx Methods 视频
└── Waters Knowledge Base: calibration curve / batch processing

阶段 6：维护与故障排除（持续学习）
├── Xevo TQ-S micro Maintenance Guide 第 5–8 章
├── How-to Series Episode 3 & 4
└── Waters Knowledge Base：support.waters.com
```

---

## 新手操作 Checklist（首次上机）

```
□ 已阅读 Xevo TQ-S micro Overview Guide 第 1–3 章
□ 已阅读 ACQUITY UPLC Familiarization Guide 全文
□ 已观看 MassLynx for Beginners 视频
□ 了解 ESI 源的组成：capillary, sample cone, gas cone, extraction cone
□ 了解 Standby / Operate 模式的区别
□ 知道如何检查 nitrogen gas 压力（source gas 和 collision gas）
□ 知道如何在 MassLynx 中创建 Project
□ 知道如何建立 Inlet Method（LC method）
□ 知道如何建立 MS Method（MRM transitions）
□ 知道如何建立 Sample List / Sequence
□ 知道如何提交 run 和监控采集进度
□ 知道如何查看 chromatogram 和 raw data
□ 知道如何打开 TargetLynx 进行基本的峰积分
□ 了解正确关机顺序
□ 知道如何清洁 sample cone
□ 紧急联系方式（Waters Service）已记录
```

---

## 日常操作 Checklist（适合打印）

```
╔══════════════════════════════════════════════════════╗
║     Waters ACQUITY UPLC + Xevo TQ-S micro            ║
║          Daily Operation Checklist                    ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  操作人: _______________  日期: _______________       ║
║                                                      ║
╠═══ 开机前检查 ════════════════════════════════════════╣
║  □ Nitrogen source gas 压力 ≥ _____ bar              ║
║  □ Collision gas (Argon) 压力 ≥ _____ bar            ║
║  □ 废液瓶已清空 / 确认空间足够                         ║
║  □ 流动相瓶余量充足                                   ║
║  □ Seal wash / needle wash 溶剂充足                  ║
║  □ 柱子已安装并确认方向正确                            ║
║                                                      ║
╠═══ 开机步骤 ══════════════════════════════════════════╣
║  □ 打开 nitrogen gas                                 ║
║  □ 打开 UPLC 电源（BSM / SM / CH 依次）               ║
║  □ 打开 MS 电源（Xevo TQ-S micro）                   ║
║  □ 打开电脑，启动 MassLynx                            ║
║  □ 检查 Mass Console：系统状态 = Ready                ║
║  □ 确认 Source temperature 已达目标值                 ║
║  □ 确认 Desolvation temperature 已达目标值            ║
║  □ 确认真空读数正常（Instrument → Vacuum Status）     ║
║  □ Equilibrate 柱子（运行至少 5–10 柱体积）            ║
║  □ 检查 UPLC 系统背压（与历史值比较）                  ║
║                                                      ║
╠═══ 采集前 ════════════════════════════════════════════╣
║  □ 打开对应 Project                                  ║
║  □ 确认 Instrument Method 正确（LC + MS）             ║
║  □ 检查 Sample List（样品顺序、文件名、样品类型）       ║
║  □ 确认 Calibration standards 和 QC 已包含            ║
║  □ 确认 Internal standard 浓度正确                   ║
║  □ 运行 System Suitability / QC check（如适用）       ║
║                                                      ║
╠═══ 采集中 ════════════════════════════════════════════╣
║  □ 观察前 1–2 针出峰是否正常（Retention time, S/N）   ║
║  □ 确认背压稳定，无 pressure spike                    ║
║  □ 无泄漏警报                                        ║
║  □ 随时监控 TIC 信号强度                              ║
║                                                      ║
╠═══ 数据处理（TargetLynx）══════════════════════════════╣
║  □ 打开 TargetLynx，加载处理方法                      ║
║  □ 批量处理（Process All Samples）                   ║
║  □ 审核 calibration curve（R² ≥ 0.99 或按方法要求）  ║
║  □ 审核 QC 回收率（CV < 15%，bias < 15%）             ║
║  □ 手动审核异常峰积分                                 ║
║  □ 导出结果报告                                       ║
║                                                      ║
╠═══ 关机步骤 ══════════════════════════════════════════╣
║  □ 用弱溶剂（水相）冲洗 LC 系统和进样针（5–10 min）    ║
║  □ 在 MassLynx 中将 MS 切换到 Standby 模式            ║
║  □ 降低 Source temperature 至室温（如需彻底关机）      ║
║  □ 确认 Source temperature < 100°C 再关 MS 电源       ║
║  □ 关闭 nitrogen gas（如彻底关机）                    ║
║  □ 关闭 UPLC 电源                                    ║
║  □ 记录运行样品数、异常情况                            ║
║                                                      ║
╠═══ 每周维护记录 ══════════════════════════════════════╣
║  □ 日期: _______  Sample cone 清洁: □              ║
║  □ Gas cone 检查: □  背压趋势: □ 正常 □ 偏高          ║
║  □ 流动相瓶清洗更换: □  溶剂管路排气: □               ║
║  □ Tune 和 calibration 验证: □  下次维护日期: _____  ║
╚══════════════════════════════════════════════════════╝
```

---

## LC-MS/MS 初学者学习路线

```
第 1 个月：打基础
│
├── 周 1–2：看完 MS Fundamentals 长视频系列（理论）
│   理解：ESI 离子化 → quadrupole 筛质量 → collision cell 碎片 → product ion → MRM
│
├── 周 3：读 Familiarization Guide（ACQUITY + TQ 系统入门）
│   理解：LC 和 MS 各模块的作用，日常开机步骤
│
└── 周 4：读 MassLynx Getting Started Guide + 看 YouTube 实操视频
    练习：创建 project → 建 method → 建 sample list → 提交 run

第 2 个月：方法开发
│
├── 周 1–2：读 Method Development Guide（MRM 方法开发全流程）
│   结合：澳門大學 Step-by-Step Tune Guide（实操图解）
│   练习：从一个已知化合物开始，手动优化 MRM transitions
│
└── 周 3–4：学习 TargetLynx 数据处理
    练习：建标准曲线 → 设 IS → 批量处理 → 审核 QC → 导出报告

第 3 个月：独立运行
│
├── 独立操作完整工作流（开机 → 采集 → 处理 → 关机）
├── 熟悉 Source 清洁和日常维护
├── 学习 troubleshooting：压力异常、信号下降、保留时间漂移
└── 参加 Waters 官方 Xevo TQ-S micro Hands-On Course（强烈推荐）
    https://www.waters.com/waters/educationInstance.htm?locale=en_US&eiid=135086700
```

---

## 付费培训资源（官方认证）

| 课程 | 链接 | 格式 | 推荐对象 |
|------|------|------|---------|
| Xevo TQ-S micro Hands-On Operation Course（2天） | https://www.waters.com/waters/educationInstance.htm?locale=en_US&eiid=135086700 | 远程或现场 | 有 6 周以上使用经验后参加 |
| TargetLynx eLearning Track | https://www.waters.com/waters/educationInstance.htm?eiid=134718932&locale=en_US | 自学 | 需要系统学数据处理的用户 |
| Clinical LCMS Application eLearning Track | https://www.waters.com/waters/educationInstance.htm?locale=en_US&eiid=134827370 | 自学 | 临床或常规检测实验室 |
| Waters Education Subscriptions（300+课程） | https://www.waters.com/nextgen/us/en/education/educational-courses-and-training/waters-education-subscriptions.html | 订阅制 | 团队系统培训 |
