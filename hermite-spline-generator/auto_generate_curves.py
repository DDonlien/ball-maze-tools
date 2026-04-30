import numpy as np
import matplotlib.pyplot as plt
import time
import csv
import sys
import os
import math
from decimal import Decimal, getcontext
from scipy.optimize import minimize
from functools import lru_cache

# 设置Decimal的精度
getcontext().prec = 20

# ==========================================
# Part 1: Arc Calculation Logic (from hermite_sample_cal.py)
# ==========================================

def calculate_exact_tangent_length(radius, angle):
    """
    计算任意角度圆弧的精确切线长度
    通过最小化Hermite曲线与圆弧的误差来得到精确解
    """
    def error_function(k):
        # 计算Hermite曲线与圆弧的误差
        t = np.linspace(0, 1, 100)
        curve_points = []
        for t_val in t:
            # Hermite基函数
            h1 = 2*t_val**3 - 3*t_val**2 + 1
            h2 = -2*t_val**3 + 3*t_val**2
            h3 = t_val**3 - 2*t_val**2 + t_val
            h4 = t_val**3 - t_val**2
            
            # 计算Hermite曲线点
            start_point = np.array([0.0, 0.0])
            end_point = np.array([radius * np.sin(angle), radius * (1 - np.cos(angle))])
            tangent_start = np.array([float(k), 0.0])
            tangent_end = np.array([float(k) * np.cos(angle), float(k) * np.sin(angle)])
            
            point = (h1 * start_point + 
                    h2 * end_point +
                    h3 * tangent_start +
                    h4 * tangent_end)
            curve_points.append(point)
        
        # 计算圆弧上的对应点
        arc_points = []
        for t_val in t:
            theta = t_val * angle
            arc_point = np.array([radius * np.sin(theta), radius * (1 - np.cos(theta))])
            arc_points.append(arc_point)
        
        # 计算误差（使用欧氏距离）
        error = np.sum([np.linalg.norm(cp - ap) for cp, ap in zip(curve_points, arc_points)])
        return error
    
    # 使用优化算法找到最小误差对应的切线长度
    result = minimize(error_function, x0=radius, method='Nelder-Mead')
    return result.x[0]

class ArcSegment:
    def __init__(self, start_point, radius, angle, direction, prev_segment=None):
        """
        初始化圆弧段
        - start_point: 起点坐标 [x, y]（仅在第一段使用）
        - radius: 圆弧半径
        - angle: 圆弧角度（度数）
        - direction: 圆弧方向（1表示逆时针，-1表示顺时针）
        - prev_segment: 前一段圆弧（可选）
        """
        self.radius = float(radius)
        self.angle = np.radians(float(angle))  # 将角度转换为弧度
        self.direction = direction
        
        # 设置起点和切线方向
        if prev_segment is None:
            self.start_point = np.array(start_point, dtype=np.float64)
            # 第一段从水平向右开始
            self.start_tangent_direction = np.array([1.0, 0.0], dtype=np.float64)
        else:
            self.start_point = prev_segment.end_point.copy()
            # 使用前一段的终点切线方向
            self.start_tangent_direction = prev_segment.end_tangent_direction.copy()
        
        # 计算旋转矩阵（从局部坐标系到全局坐标系）
        cos_theta = self.start_tangent_direction[0]
        sin_theta = self.start_tangent_direction[1]
        self.rotation_matrix = np.array([
            [cos_theta, -sin_theta],
            [sin_theta, cos_theta]
        ], dtype=np.float64)
        
        # 在局部坐标系中，圆心位于起点的法向量方向
        local_center_direction = np.array([0, self.direction], dtype=np.float64)
        self.center = self.start_point + self.rotation_matrix @ (local_center_direction * self.radius)
        
        # 计算终点
        # 在局部坐标系中，终点相对于起点的位置
        local_end_offset = np.array([
            self.radius * np.sin(self.angle),  # x方向偏移
            self.direction * self.radius * (1 - np.cos(self.angle))  # y方向偏移
        ], dtype=np.float64)
        self.end_point = self.start_point + self.rotation_matrix @ local_end_offset
        
        # 计算终点的切线方向
        local_end_tangent_direction = np.array([
            np.cos(self.direction * self.angle),
            np.sin(self.direction * self.angle)
        ], dtype=np.float64)
        self.end_tangent_direction = self.rotation_matrix @ local_end_tangent_direction
        
        # 计算Hermite曲线的切线向量
        # 使用圆弧的切线方向，但调整长度以匹配Hermite曲线的要求
        # 计算精确的切线长度
        k = calculate_exact_tangent_length(self.radius, abs(self.angle))
        
        self.tangent_start = self.start_tangent_direction * k
        self.tangent_end = self.end_tangent_direction * k
        
        # 计算真实圆弧的起点和终点角度
        start_vector = self.start_point - self.center
        end_vector = self.end_point - self.center
        
        self.start_angle = np.arctan2(start_vector[1], start_vector[0])
        self.end_angle = np.arctan2(end_vector[1], end_vector[0])
        
        # 规范化角度差
        angle_diff = self.end_angle - self.start_angle
        if self.direction == 1:  # 逆时针
            if angle_diff < 0:
                angle_diff += 2 * np.pi
        else:  # 顺时针
            if angle_diff > 0:
                angle_diff -= 2 * np.pi
        
        self.actual_angle_diff = angle_diff
    
    def get_arc_points(self, num_points=100):
        """获取真实圆弧上的点"""
        if abs(self.actual_angle_diff) < 1e-10:
            # 如果角度差太小，直接返回起点和终点
            return [self.start_point[0], self.end_point[0]], [self.start_point[1], self.end_point[1]]
        
        # 生成角度序列
        angles = np.linspace(self.start_angle, self.start_angle + self.actual_angle_diff, num_points)
        
        # 计算圆弧点
        arc_x = self.center[0] + self.radius * np.cos(angles)
        arc_y = self.center[1] + self.radius * np.sin(angles)
        
        return arc_x, arc_y

# ==========================================
# Part 2: Hermite Fit Logic (from hermite_vector_fit.py)
# ==========================================

def eval_hermite(p0, p1, t0, t1, a):
    a2 = a ** 2.0
    a3 = a ** 3.0
    return (2*a3-3*a2+1)*p0 + (-2*a3+3*a2)*p1 + (a3-2*a2+a)*t0 + (a3-a2)*t1

def get_err(pa0, pa1, ta0, ta1, pb0, pb1, tb0, tb1, target, step):
    # 使用向量化操作替代循环
    a = np.arange(0, 1.0 + step, step)
    a2 = a ** 2.0
    a3 = a ** 3.0
    
    # 预计算系数
    h00 = 2*a3-3*a2+1
    h01 = -2*a3+3*a2
    h10 = a3-2*a2+a
    h11 = a3-a2
    
    # 一次性计算所有点的位置
    points_a = h00[:, np.newaxis] * pa0 + h01[:, np.newaxis] * pa1 + h10[:, np.newaxis] * ta0 + h11[:, np.newaxis] * ta1
    points_b = h00[:, np.newaxis] * pb0 + h01[:, np.newaxis] * pb1 + h10[:, np.newaxis] * tb0 + h11[:, np.newaxis] * tb1
    
    # 计算距离
    dist_sqr = (np.linalg.norm(points_a - points_b, axis=1) - target) ** 2
    return np.mean(dist_sqr), np.max(dist_sqr)

def _to_tuple(arr):
    """将numpy数组转换为元组以便哈希"""
    if isinstance(arr, np.ndarray):
        return tuple(arr.tolist())
    return arr

@lru_cache(maxsize=128)
def cached_get_err(pa0, pa1, ta0, ta1, pb0, pb1, tb0, tb1, target, step):
    # 将numpy数组转换为元组以便哈希
    pa0 = _to_tuple(pa0)
    pa1 = _to_tuple(pa1)
    ta0 = _to_tuple(ta0)
    ta1 = _to_tuple(ta1)
    pb0 = _to_tuple(pb0)
    pb1 = _to_tuple(pb1)
    tb0 = _to_tuple(tb0)
    tb1 = _to_tuple(tb1)
    
    # 转换回numpy数组进行计算
    pa0 = np.array(pa0)
    pa1 = np.array(pa1)
    ta0 = np.array(ta0)
    ta1 = np.array(ta1)
    pb0 = np.array(pb0)
    pb1 = np.array(pb1)
    tb0 = np.array(tb0)
    tb1 = np.array(tb1)
    
    return get_err(pa0, pa1, ta0, ta1, pb0, pb1, tb0, tb1, target, step)

def fit(pa0, pa1, ta0, ta1, pb0, pb1, step, trys):
    target = np.linalg.norm(pa0-pb0)
    
    # 使用更高效的搜索策略，但保持与原始代码相同的精度
    # 第一阶段：粗略搜索
    delta = 0.001
    a_coarse = np.arange(delta, 3.0, delta)
    errs_coarse = []
    for a in a_coarse:
        tb0 = ta0 * a
        tb1 = ta1 * a
        # 将numpy数组转换为元组以便哈希
        pa0_tuple = _to_tuple(pa0)
        pa1_tuple = _to_tuple(pa1)
        ta0_tuple = _to_tuple(ta0)
        ta1_tuple = _to_tuple(ta1)
        pb0_tuple = _to_tuple(pb0)
        pb1_tuple = _to_tuple(pb1)
        tb0_tuple = _to_tuple(tb0)
        tb1_tuple = _to_tuple(tb1)
        err = cached_get_err(pa0_tuple, pa1_tuple, ta0_tuple, ta1_tuple, 
                           pb0_tuple, pb1_tuple, tb0_tuple, tb1_tuple, 
                           target, step)[0]
        errs_coarse.append(err)
    errs_coarse = np.array(errs_coarse)
    min_idx = np.argmin(errs_coarse)
    min_a = a_coarse[min_idx]
    
    # 第二阶段：精细搜索
    a_fine = np.arange(min_a - delta * 0.5, min_a + delta * 0.5, delta * delta)
    errs_fine = []
    for a in a_fine:
        tb0 = ta0 * a
        tb1 = ta1 * a
        # 将numpy数组转换为元组以便哈希
        pa0_tuple = _to_tuple(pa0)
        pa1_tuple = _to_tuple(pa1)
        ta0_tuple = _to_tuple(ta0)
        ta1_tuple = _to_tuple(ta1)
        pb0_tuple = _to_tuple(pb0)
        pb1_tuple = _to_tuple(pb1)
        tb0_tuple = _to_tuple(tb0)
        tb1_tuple = _to_tuple(tb1)
        err = cached_get_err(pa0_tuple, pa1_tuple, ta0_tuple, ta1_tuple, 
                           pb0_tuple, pb1_tuple, tb0_tuple, tb1_tuple, 
                           target, step)[0]
        errs_fine.append(err)
    errs_fine = np.array(errs_fine)
    min_idx_fine = np.argmin(errs_fine)
    min_a_fine = a_fine[min_idx_fine]
    
    return min_a_fine * ta0, min_a_fine * ta1, errs_fine[min_idx_fine]

def normalize_vector(v):
    """归一化向量"""
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

def calculate_normal(tangent):
    """计算切线的法向量"""
    # 在3D空间中，我们需要确保法向量与切线垂直
    # 这里我们使用一个简单的方法：将切线旋转90度
    normal = np.array([-tangent[1], tangent[0], 0])
    return normalize_vector(normal)

def generate_parallel_curve(pa0, pa1, ta0, ta1, gap, step=0.01):
    """生成平行曲线的控制点和切向量"""
    # 计算控制点的法向量
    n0 = calculate_normal(ta0)
    n1 = calculate_normal(ta1)
    
    # 计算新的控制点
    pb0 = pa0 + gap * n0
    pb1 = pa1 + gap * n1
    
    # 使用fit函数计算切向量
    tb0, tb1, err = fit(pa0, pa1, ta0, ta1, pb0, pb1, step, 1)
    
    return pb0, pb1, tb0, tb1, err

def generate_multiple_parallel_curves(control_points, tangents, gap, num_curves, step=0.01, segment_tangents=None):
    """生成多条平行曲线
    
    Args:
        control_points: 控制点列表
        tangents: 切线列表 (如果segment_tangents为None，则使用此列表)
        gap: 间距
        num_curves: 曲线数量
        step: 步长
        segment_tangents: 每段的独立切线列表 [(t_start, t_end), ...]。如果提供，将优先使用。
    """
    curves = []
    n_segments = len(control_points) - 1
    
    # 预计算所有基础段
    if segment_tangents is not None and len(segment_tangents) == n_segments:
        base_segments = [(control_points[i], control_points[i+1], segment_tangents[i][0], segment_tangents[i][1]) 
                        for i in range(n_segments)]
    else:
        base_segments = [(control_points[i], control_points[i+1], tangents[i], tangents[i+1]) 
                        for i in range(n_segments)]
    
    # 存储正方向和反方向的最新曲线段
    positive_segments = base_segments.copy()
    negative_segments = base_segments.copy()
    
    # 预计算所有可能的gap值
    gaps = np.array([gap/2 if i < 2 else gap for i in range(num_curves)])
    gaps[1::2] *= -1  # 交替正负
    
    # 存储所有生成的曲线段及其Y坐标
    all_curves = []
    
    for i in range(num_curves):
        current_gap = gaps[i]
        base_segments = positive_segments if i % 2 == 0 else negative_segments
        
        # 生成新曲线的所有段
        new_segments = []
        for j in range(n_segments):
            base_p0, base_p1, base_t0, base_t1 = base_segments[j]
            new_p0, new_p1, new_t0, new_t1, err = generate_parallel_curve(
                base_p0, base_p1, base_t0, base_t1, current_gap, step
            )
            new_segments.append((new_p0, new_p1, new_t0, new_t1, err))
        
        # 计算曲线的平均Y坐标
        avg_y = np.mean([(p0[1] + p1[1])/2 for p0, p1, _, _, _ in new_segments])
        all_curves.append((new_segments, avg_y))
        
        # 更新正方向或反方向的最新曲线段
        if i % 2 == 0:
            positive_segments = [(p0, p1, t0, t1) for p0, p1, t0, t1, _ in new_segments]
        else:
            negative_segments = [(p0, p1, t0, t1) for p0, p1, t0, t1, _ in new_segments]
    
    # 根据Y坐标排序
    all_curves.sort(key=lambda x: x[1])
    
    # 返回排序后的曲线段
    return [curve[0] for curve in all_curves]

# ==========================================
# Part 3: Main Execution Logic
# ==========================================

def get_arc_definitions():
    """
    在此处定义圆弧段。
    用户可以修改此函数来改变参考曲线的形状。
    """
    segments = []
    
    # --- 用户配置区域 开始 ---
    
    # 第一段：从(0,0)开始，半径32，90度，顺时针(-1)
    seg1 = ArcSegment([0.0, 0.0], 0.2, 90, 1)
    segments.append(seg1)
    
    # 第二段：连接到第一段，半径20，53.13度，顺时针
    # seg2 = ArcSegment(None, 16.0, 90, 1, prev_segment=seg1)
    # segments.append(seg2)
    
    # --- 用户配置区域 结束 ---
    
    return segments

def get_generation_parameters():
    """定义生成平行曲线的参数"""
    return {
        'gap': 4,         # 曲线间距
        'num_curves': 2,   # 平行曲线数量
        'step': 0.01       # 拟合步长
    }

def convert_to_3d(point_2d):
    """将2D点/向量转换为3D (z=0)"""
    return np.array([point_2d[0], point_2d[1], 0.0])

def save_results_to_csv(control_points, tangents, parallel_curves, filename='hermite_spline_auto.csv'):
    """保存结果到CSV"""
    headers = ['Parameter'] + ['Reference'] + [f'Parallel_{i}' for i in range(len(parallel_curves))]
    
    rows = []
    n_segments = len(control_points) - 1
    
    # 准备数据
    ref_data = []
    for i in range(n_segments):
        ref_data.extend([
            f'P{i}', control_points[i].tolist(),
            f'T{i}', tangents[i].tolist(),
            f'P{i+1}', control_points[i+1].tolist(),
            f'T{i+1}', tangents[i+1].tolist()
        ])
    
    parallel_data = []
    for curve in parallel_curves:
        curve_data = []
        for segment in curve:
            p0, p1, t0, t1, _ = segment
            curve_data.extend([
                p0.tolist(), t0.tolist(), p1.tolist(), t1.tolist()
            ])
        parallel_data.append(curve_data)
    
    try:
        with open(filename, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            for i in range(0, len(ref_data), 2):
                row = [ref_data[i], ref_data[i+1]]
                for curve_data in parallel_data:
                    if i//2 < len(curve_data):
                        row.append(curve_data[i//2])
                    else:
                        row.append("")
                writer.writerow(row)
        print(f"数据已保存到 {filename}")
    except Exception as e:
        print(f"保存CSV失败: {e}")

def plot_all(segments, control_points, tangents, parallel_curves):
    """绘制所有内容：真实圆弧、Hermite近似、平行曲线"""
    plt.figure(figsize=(12, 12))
    
    # 1. 绘制真实圆弧 (Ground Truth)
    print("绘制真实圆弧...")
    for i, seg in enumerate(segments):
        arc_x, arc_y = seg.get_arc_points()
        plt.plot(arc_x, arc_y, 'k:', linewidth=1.5, alpha=0.5, label='True Arc' if i==0 else "")
        
        # 标注圆心
        plt.scatter([seg.center[0]], [seg.center[1]], color='gray', marker='x', s=30, alpha=0.5)
    
    # 2. 绘制Hermite参考曲线 (Reference Curve)
    print("绘制Hermite参考曲线...")
    t_values = np.linspace(0, 1, 100)
    ref_points_all = []
    
    # 重新提取每段的切线用于绘图
    current_tangents = []
    if segments:
        for seg in segments:
            t_start = convert_to_3d(seg.tangent_start)
            t_end = convert_to_3d(seg.tangent_end)
            current_tangents.append((t_start, t_end))
            
    for i in range(len(control_points) - 1):
        p0 = control_points[i]
        p1 = control_points[i+1]
        
        if i < len(current_tangents):
            t0, t1 = current_tangents[i]
        else:
            t0 = tangents[i]
            t1 = tangents[i+1]
        
        segment_points = np.array([eval_hermite(p0, p1, t0, t1, t) for t in t_values])
        ref_points_all.append(segment_points)
        
    if ref_points_all:
        ref_points_viz = np.vstack(ref_points_all)
        plt.plot(ref_points_viz[:,0], ref_points_viz[:,1], 'b--', linewidth=2, label='Hermite Reference')

    # 绘制控制点和切线
    scale = 10.0 # 切线显示长度缩放
    # 绘制点
    for i, p in enumerate(control_points):
        plt.scatter([p[0]], [p[1]], color='blue', zorder=5)
        plt.annotate(f'P{i}', (p[0], p[1]), xytext=(5, 5), textcoords='offset points')
    
    # 绘制每段的独立切线
    if current_tangents:
        for i, (t_start, t_end) in enumerate(current_tangents):
            p_start = control_points[i]
            p_end = control_points[i+1]
            
            # 起点切线
            t_norm_start = t_start / np.linalg.norm(t_start) if np.linalg.norm(t_start) > 0 else t_start
            plt.arrow(p_start[0], p_start[1], t_norm_start[0]*5, t_norm_start[1]*5, color='blue', alpha=0.3, width=0.5)
            
            # 终点切线
            t_norm_end = t_end / np.linalg.norm(t_end) if np.linalg.norm(t_end) > 0 else t_end
            plt.arrow(p_end[0], p_end[1], t_norm_end[0]*5, t_norm_end[1]*5, color='cyan', alpha=0.3, width=0.3)
    else:
        for i, (p, t) in enumerate(zip(control_points, tangents)):
            t_norm = t / np.linalg.norm(t) if np.linalg.norm(t) > 0 else t
            plt.arrow(p[0], p[1], t_norm[0]*5, t_norm[1]*5, color='blue', alpha=0.3, width=0.5)

    # 3. 绘制平行曲线
    print("绘制平行曲线...")
    colors = ['r', 'g', 'c', 'm', 'y', 'orange', 'purple']
    for i, curve_segments in enumerate(parallel_curves):
        curve_points_all = []
        for seg in curve_segments:
            p0, p1, t0, t1, _ = seg
            pts = np.array([eval_hermite(p0, p1, t0, t1, t) for t in t_values])
            curve_points_all.append(pts)
        
        if curve_points_all:
            curve_viz = np.vstack(curve_points_all)
            avg_y = np.mean(curve_viz[:, 1])
            color = colors[i % len(colors)]
            plt.plot(curve_viz[:,0], curve_viz[:,1], color=color, linewidth=2, 
                     label=f'Parallel {i} (Y~={avg_y:.1f})')
            
            # 绘制平行曲线的控制点
            for seg in curve_segments:
                plt.scatter([seg[0][0], seg[1][0]], [seg[0][1], seg[1][1]], color=color, s=20)
                
            # 绘制平行曲线的切线向量 (虚线 + 箭头)
            scale = 0.5  # 切线显示比例
            for seg in curve_segments:
                p0, p1, t0, t1, _ = seg
                # 起点切线
                plt.plot([p0[0], p0[0] + t0[0] * scale], [p0[1], p0[1] + t0[1] * scale], 
                         color=color, linestyle='--', linewidth=1, alpha=0.7)
                # 终点切线
                plt.plot([p1[0], p1[0] + t1[0] * scale], [p1[1], p1[1] + t1[1] * scale], 
                         color=color, linestyle='--', linewidth=1, alpha=0.7)

    plt.title('Automated Hermite Spline Generation (Standalone)')
    plt.legend()
    plt.grid(True)
    plt.axis('equal')
    plt.gca().invert_yaxis() # 保持Y向下为正的习惯
    plt.tight_layout()
    plt.show()

def main():
    print("=== 自动圆弧平行曲线生成器 (Standalone) ===")
    
    # 1. 获取圆弧定义
    segments = get_arc_definitions()
    if not segments:
        print("未定义圆弧段！")
        return

    print(f"已定义 {len(segments)} 段圆弧。")

    # 2. 提取控制点和切线，并转换为3D格式
    control_points_2d = [seg.start_point for seg in segments] + [segments[-1].end_point]
    
    # 为了兼容旧接口，构造一个名义上的 tangents 列表 (使用每段的起点切线 + 最后一段的终点切线)
    # 但实际上我们会使用 segment_tangents 来进行精确拟合
    tangents_2d = [seg.tangent_start for seg in segments] + [segments[-1].tangent_end]
    
    # 转换为3D
    control_points = [convert_to_3d(p) for p in control_points_2d]
    tangents = [convert_to_3d(t) for t in tangents_2d]
    
    # 构造每段的独立切线
    segment_tangents = []
    for seg in segments:
        t_start = convert_to_3d(seg.tangent_start)
        t_end = convert_to_3d(seg.tangent_end)
        segment_tangents.append((t_start, t_end))
    
    print("参考曲线控制点:")
    for i, p in enumerate(control_points):
        print(f"P{i}: {p}")
    print("参考曲线切线 (仅显示连接点切线，实际拟合使用每段独立切线):")
    for i, t in enumerate(tangents):
        print(f"T{i}: {t}")

    # 3. 获取生成参数
    params = get_generation_parameters()
    print(f"生成参数: {params}")

    # 4. 生成平行曲线
    start_time = time.time()
    print("开始生成平行曲线...")
    parallel_curves = generate_multiple_parallel_curves(
        control_points, tangents,
        params['gap'], params['num_curves'],
        params['step'],
        segment_tangents=segment_tangents
    )
    print(f"生成完成，耗时: {time.time() - start_time:.4f} 秒")

    # 5. 打印详细信息
    print("\n生成的平行曲线详细信息:")
    for i, curve_segments in enumerate(parallel_curves):
        print(f"\n平行曲线 {i}:")
        max_err = 0
        for j, (p0, p1, t0, t1, err) in enumerate(curve_segments):
            print(f"  段 {j}:")
            print(f"    p0={p0}")
            print(f"    p1={p1}")
            print(f"    t0={t0}")
            print(f"    t1={t1}")
            print(f"    拟合误差: {err:.6f}")
            max_err = max(max_err, err)
        print(f"  -> 该曲线最大误差: {max_err:.6f}")

    # 6. 保存CSV
    save_results_to_csv(control_points, tangents, parallel_curves)

    # 7. 绘图
    plot_all(segments, control_points, tangents, parallel_curves)

if __name__ == "__main__":
    main()