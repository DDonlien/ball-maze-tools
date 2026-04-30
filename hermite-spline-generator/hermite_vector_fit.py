import numpy as np
import matplotlib.pyplot as plt
import argparse
import time
from functools import lru_cache
import csv

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

def generate_multiple_parallel_curves(control_points, tangents, gap, num_curves, step=0.01):
    """生成多条平行曲线
    
    Args:
        control_points: 控制点列表
        tangents: 切线列表
        gap: 间距
        num_curves: 曲线数量
        step: 步长
    """
    curves = []
    n_segments = len(control_points) - 1
    
    # 预计算所有基础段
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

def get_reference_curve():
    """定义参考曲线的控制点和切线"""
    # 每增加一行，多一个控制点，控制点和曲线按上下顺序一一对应
    control_points = [
        np.array([0, 0.0, 0.0]),        
        np.array([32, -32, 0.0])  # 修改：Y坐标取负值使向下为正
    ]

    tangents = [
        np.array([52.32197266, 0, 0.0]),        
        np.array([0, -52.32197266, 0.0])     # 修改：Y分量取负值使向下为正
    ]
    
    return control_points, tangents

def get_parameters():
    """定义生成曲线的参数"""
    return {
        'gap': 4,        # 曲线间距
        'num_curves': 2,   # 要生成的平行曲线数量
        'step': 0.01       # 拟合步长
    }

def plot_curves(control_points, tangents, parallel_curves, params):
    """绘制所有曲线"""
    # 创建图形
    plt.figure(figsize=(10, 10))
    
    # 绘制参考曲线
    t_values = np.linspace(0, 1, 100)
    ref_points = []
    for i in range(len(control_points) - 1):
        segment_points = np.array([eval_hermite(control_points[i], control_points[i+1], 
                                              tangents[i], tangents[i+1], t) 
                                 for t in t_values])
        ref_points.append(segment_points)
    ref_points = np.vstack(ref_points)
    plt.plot(ref_points[:,0], ref_points[:,1], 'b--', label='Reference Curve', linewidth=2)
    
    # 绘制参考曲线的控制点
    for i, p in enumerate(control_points):
        plt.scatter([p[0]], [p[1]], color='blue', zorder=3)
        plt.annotate(f'P{i}', (p[0], p[1]), xytext=(5, 5), textcoords='offset points')
    
    # 绘制参考曲线的切线向量
    scale = 0.5
    for i, (p, t) in enumerate(zip(control_points, tangents)):
        plt.plot([p[0], p[0] + t[0] * scale], [p[1], p[1] + t[1] * scale], 
                 'b--', linewidth=1)
        mid_point = p + t * scale * 0.5
        plt.annotate(f'T{i}', (mid_point[0], mid_point[1]), xytext=(5, 5), textcoords='offset points')
    
    # 绘制生成的平行曲线
    colors = ['r', 'g', 'c', 'm', 'y', 'k', '#FFA500', '#800080', '#008000', '#0000FF', 
              '#FF00FF', '#00FFFF', '#FFD700', '#A52A2A', '#808080', '#000000']
    for i, curve_segments in enumerate(parallel_curves):
        # 为每条平行曲线生成点
        curve_points = []
        for segment in curve_segments:
            p0, p1, t0, t1, _ = segment
            segment_points = np.array([eval_hermite(p0, p1, t0, t1, t) for t in t_values])
            curve_points.append(segment_points)
        curve_points = np.vstack(curve_points)
        
        # 计算曲线的平均Y坐标
        avg_y = np.mean(curve_points[:, 1])
        
        # 绘制曲线
        plt.plot(curve_points[:,0], curve_points[:,1], color=colors[i], linestyle='-', 
                label=f'Curve {i} (Y={avg_y:.2f})', linewidth=2)
        
        # 绘制控制点和切线向量
        for j, (p0, p1, t0, t1, _) in enumerate(curve_segments):
            # 绘制控制点
            plt.scatter([p0[0]], [p0[1]], color=colors[i], zorder=3)
            plt.scatter([p1[0]], [p1[1]], color=colors[i], zorder=3)
            
            # 绘制起点切线
            plt.plot([p0[0], p0[0] + t0[0] * scale], [p0[1], p0[1] + t0[1] * scale], 
                     color=colors[i], linestyle='--', linewidth=1)
            # 绘制终点切线
            plt.plot([p1[0], p1[0] + t1[0] * scale], [p1[1], p1[1] + t1[1] * scale], 
                     color=colors[i], linestyle='--', linewidth=1)
    
    # 设置图形属性
    plt.title(f'Hermite Curves with {len(control_points)} Control Points')
    plt.legend()
    plt.grid(True)
    plt.axis('equal')
    # 修改：反转Y轴方向
    plt.gca().invert_yaxis()
    plt.show()

def print_results(control_points, tangents, parallel_curves):
    """打印计算结果"""
    print(f"参考曲线 (共{len(control_points)}个控制点):")
    for i, p in enumerate(control_points):
        print(f"P{i}={p}")
    for i, t in enumerate(tangents):
        print(f"T{i}={t}")
    
    print("\n生成的平行曲线:")
    for i, curve_segments in enumerate(parallel_curves):
        print(f"\n曲线 {i}:")
        for j, (p0, p1, t0, t1, err) in enumerate(curve_segments):
            print(f"段 {j}:")
            print(f"p0={p0}")
            print(f"p1={p1}")
            print(f"t0={t0}")
            print(f"t1={t1}")
            print(f"拟合误差: {err}")

def save_to_csv(control_points, tangents, parallel_curves):
    """将曲线数据保存到CSV文件"""
    # 准备表头
    headers = ['Parameter'] + ['Reference'] + [f'Parallel_{i}' for i in range(len(parallel_curves))]
    
    # 准备数据行
    rows = []
    n_segments = len(control_points) - 1
    
    # 添加参考曲线的数据
    ref_data = []
    for i in range(n_segments):
        ref_data.extend([
            f'P{i}', control_points[i].tolist(),
            f'T{i}', tangents[i].tolist(),
            f'P{i+1}', control_points[i+1].tolist(),
            f'T{i+1}', tangents[i+1].tolist()
        ])
    
    # 添加平行曲线的数据
    parallel_data = []
    for curve in parallel_curves:
        curve_data = []
        for segment in curve:
            p0, p1, t0, t1, _ = segment
            curve_data.extend([
                p0.tolist(),
                t0.tolist(),
                p1.tolist(),
                t1.tolist()
            ])
        parallel_data.append(curve_data)
    
    # 写入CSV文件
    with open('hermite_spline.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        # 写入参考曲线数据
        for i in range(0, len(ref_data), 2):
            param_name = ref_data[i]
            row = [param_name]
            row.append(ref_data[i+1])
            
            # 添加平行曲线数据
            for curve_data in parallel_data:
                row.append(curve_data[i//2])
            
            writer.writerow(row)

def main():
    # 开始计时
    start_time = time.time()
    
    # 获取参考曲线参数
    control_points, tangents = get_reference_curve()
    
    # 获取生成参数
    params = get_parameters()
    
    # 生成平行曲线
    parallel_curves = generate_multiple_parallel_curves(
        control_points, tangents, 
        params['gap'], params['num_curves'], 
        params['step']
    )
    
    # 打印结果
    print_results(control_points, tangents, parallel_curves)
    
    # 保存到CSV文件
    save_to_csv(control_points, tangents, parallel_curves)
    
    # 计算执行时间
    end_time = time.time()
    print(f"执行时间: {end_time - start_time} 秒")
    
    # 绘制图形
    plot_curves(control_points, tangents, parallel_curves, params)

if __name__ == "__main__":
    main()
