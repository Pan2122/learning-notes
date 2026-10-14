---
layout: doc
title: AD 圆角矩形与 PCB 板框绘制
description: 使用 Rectangle 的 Fillet 模式一次设置四角圆角，并将轮廓转换为实际 PCB Board Shape。
tags:
  - Altium Designer
  - PCB
  - 板框
  - EDA
---

# AD 圆角矩形与 PCB 板框绘制

> 四个角同时倒圆角，不必逐个手画 Arc。关键是区分“画出轮廓”和“定义实际板形”。

本文针对 **PCB 编辑器**，不是原理图编辑器中的圆角矩形。菜单文字可能随 AD 版本或语言设置略有变化，以下保留英文名称便于查找。

## 1. 一次设置四个圆角

1. 打开 PCB 文档，切换到用于绘制轮廓的独立 Mechanical Layer。
2. 执行 `Place → Rectangle`，开始放置矩形。
3. 按 `Tab` 暂停放置，在 `Properties` 面板中修改属性。
4. 将 `Corner Mode` 设为 `Fillet`。
5. 在 `Fillet/Chamfer Size` 中输入所需尺寸，例如 `2mm`；这是教学示例，实际按结构要求设置。
6. 恢复放置，点击两个对角点完成矩形。也可以先放置，再选中对象，在属性面板精确修改 `Width`、`Height` 和圆角尺寸。

| Corner Mode | 角的形状 |
| --- | --- |
| Rectangle | 直角 |
| Fillet | 圆角 |
| Chamfer | 斜切倒角 |

**放置 Rectangle 时按 `Space`，可循环切换上述三种模式。** 这个快捷键有操作状态限制：拖动已放置对象时，空格可能用于旋转，不要与放置阶段混淆。

以上属性和快捷键见 [Altium 官方 Rectangle 说明](https://www.altium.com/documentation/altium-designer/pcb/tracks-arcs#working-with-rectangles)。

## 2. 将轮廓定义为实际 PCB 板形

Mechanical Layer 上的圆角轮廓只是图形，**放置它不会自动改变实际 Board Shape**。

### 优先尝试：直接从矩形定义

1. 保存 PCB 文档，并确认圆角矩形的尺寸和位置。
2. 只选中目标矩形。
3. 在 `Design → Board Shape` 下执行 `Define from Selected Objects`（部分版本显示为 `Define Board Shape from Selected Objects`）。
4. 检查实际板边是否已更新为目标圆角轮廓。

[Altium 官方板形教程](https://my.altium.com/altium-designer/evaluation-guide/defining-pcb-board-shape)给出了由矩形设置角型和精确尺寸，再直接定义 Board Shape 的流程，因此不应把“先拆解”写成所有版本都必须执行的步骤。

### 兼容路径：拆解后再定义

如果当前版本或对象状态下不能直接识别 Rectangle，可改用基础图元：

1. 选中圆角矩形。
2. 执行 `Tools → Convert → Explode Rectangle to Free Primitives`。
3. 重新选中构成外轮廓的全部线段和圆弧，不要混入文字、尺寸标注或其它图形。
4. 执行前述 Board Shape 定义命令。

拆解后，原本统一编辑的 Rectangle 变成独立图元。需要统一修改四角尺寸时，优先在拆解前完成；误拆解可及时撤销。拆解命令见 [Altium 官方文档](https://www.altium.com/documentation/altium-designer/pcb/tracks-arcs#working-with-rectangles)。

## 3. 转换前后检查什么？

| 检查项 | 要点 |
| --- | --- |
| 轮廓闭合 | 端点连续，没有缺口或重叠图元 |
| 选择范围 | 只有目标外轮廓，没有混入其它对象 |
| 几何尺寸 | 核对宽、高、圆角和坐标，确认单位无误 |
| 实际板形 | 检查 Board Shape，而不只是看机械层上的线 |
| 已有布局 | 板边变化后，复核元件、铜皮和走线到板边的间距 |
| 制造输出 | 核对交付文件中的外形与实际板形一致 |

如果已经有一个直角 PCB 板框，也可以按新尺寸绘制圆角轮廓，再重新定义 Board Shape；不要仅修改机械层图形后就认为实际板形已经改变。

## 4. 操作速记

```text
Mechanical Layer 上放置 Rectangle
→ Corner Mode = Fillet
→ 设置圆角尺寸、Width、Height
→ 选中目标轮廓
→ Define from Selected Objects
→ 检查实际 Board Shape 和制造输出

无法直接识别 Rectangle 时：
先 Explode Rectangle to Free Primitives，再选中完整轮廓定义板形。
```

相关笔记：[AD 设计小 Tips](./ad-shortcuts.md)。
