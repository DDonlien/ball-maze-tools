import numpy as np
import matplotlib.pyplot as plt
import math
from decimal import Decimal, getcontext
from scipy.optimize import minimize

# 设置Decimal的精度
getcontext().prec = 20

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
    
    def hermite_curve(self, t):
        """计算Hermite曲线上的点，使用Decimal进行高精度计算"""
        # 将输入转换为Decimal
        t = Decimal(str(t))
        
        # Hermite基函数（使用Decimal计算）
        h1 = Decimal('2') * t**3 - Decimal('3') * t**2 + Decimal('1')    # 起点权重
        h2 = Decimal('-2') * t**3 + Decimal('3') * t**2                  # 终点权重
        h3 = t**3 - Decimal('2') * t**2 + t                             # 起点切线权重
        h4 = t**3 - t**2                                                # 终点切线权重
        
        # 将控制点转换为Decimal
        start_point = [Decimal(str(x)) for x in self.start_point]
        end_point = [Decimal(str(x)) for x in self.end_point]
        tangent_start = [Decimal(str(x)) for x in self.tangent_start]
        tangent_end = [Decimal(str(x)) for x in self.tangent_end]
        
        # 计算曲线点（使用Decimal进行所有计算）
        point = [
            h1 * start_point[0] + h2 * end_point[0] + h3 * tangent_start[0] + h4 * tangent_end[0],
            h1 * start_point[1] + h2 * end_point[1] + h3 * tangent_start[1] + h4 * tangent_end[1]
        ]
        
        # 将结果转换回float64
        return np.array([float(x) for x in point], dtype=np.float64)
    
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

def plot_arc_segments(segments):
    """绘制多个圆弧段"""
    plt.figure(figsize=(12, 10))
    
    colors = ['blue', 'red', 'green', 'orange', 'purple', 'brown']
    
    for i, segment in enumerate(segments):
        color = colors[i % len(colors)]
        
        # 生成Hermite曲线点
        t_values = np.linspace(0, 1, 100)
        curve_points = np.array([segment.hermite_curve(t) for t in t_values])
        
        # 绘制Hermite曲线
        plt.plot(curve_points[:,0], curve_points[:,1], 
                color=color, label=f"Hermite Curve {i+1}", linewidth=2)
        
        # 绘制真实圆弧
        arc_x, arc_y = segment.get_arc_points()
        plt.plot(arc_x, arc_y, color=color, linestyle='--', 
                label=f"True Arc {i+1}", linewidth=1, alpha=0.7)
        
        # 绘制控制点和圆心
        plt.scatter([segment.start_point[0], segment.end_point[0]], 
                   [segment.start_point[1], segment.end_point[1]], 
                   color=color, s=60, zorder=5, marker='o')
        plt.scatter([segment.center[0]], [segment.center[1]], 
                   color=color, s=40, zorder=5, marker='s', alpha=0.7)
        
        # 绘制切线向量
        scale = 0.3
        plt.arrow(segment.start_point[0], segment.start_point[1],
                 segment.tangent_start[0] * scale, segment.tangent_start[1] * scale,
                 head_width=0.5, head_length=0.3, fc=color, ec=color, alpha=0.6)
        plt.arrow(segment.end_point[0], segment.end_point[1],
                 segment.tangent_end[0] * scale, segment.tangent_end[1] * scale,
                 head_width=0.5, head_length=0.3, fc=color, ec=color, alpha=0.6)
        
        # 添加坐标值标注（显示4位小数）
        offset = 5 + i * 3  # 避免重叠
        plt.annotate(f'S{i+1}({segment.start_point[0]:.4f}, {segment.start_point[1]:.4f})',
                    segment.start_point, xytext=(offset, offset), 
                    textcoords='offset points', fontsize=8)
        plt.annotate(f'E{i+1}({segment.end_point[0]:.4f}, {segment.end_point[1]:.4f})',
                    segment.end_point, xytext=(offset, offset), 
                    textcoords='offset points', fontsize=8)
        plt.annotate(f'C{i+1}({segment.center[0]:.4f}, {segment.center[1]:.4f})',
                    segment.center, xytext=(offset, offset), 
                    textcoords='offset points', fontsize=8, alpha=0.7)
        
        # 输出每个段的关键参数（显示8位小数）
        print(f"\n第{i+1}段圆弧参数：")
        print(f"起点: [{segment.start_point[0]:.8f}, {segment.start_point[1]:.8f}]")
        print(f"终点: [{segment.end_point[0]:.8f}, {segment.end_point[1]:.8f}]")
        print(f"圆心: [{segment.center[0]:.8f}, {segment.center[1]:.8f}]")
        print(f"半径: {segment.radius:.8f}")
        print(f"角度: {np.degrees(segment.angle):.8f}度")
        print(f"方向: {'逆时针' if segment.direction == 1 else '顺时针'}")
        print(f"起点切线向量: [{segment.tangent_start[0]:.8f}, {segment.tangent_start[1]:.8f}]")
        print(f"终点切线向量: [{segment.tangent_end[0]:.8f}, {segment.tangent_end[1]:.8f}]")
    
    plt.title("Multiple Arc Segments with Hermite Curves (Y-axis down positive)")
    plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    plt.axis('equal')
    plt.grid(True, alpha=0.3)
    # 确保Y轴向下为正
    plt.gca().invert_yaxis()
    plt.tight_layout()
    plt.show()

# 示例：创建多个圆弧段
print("创建圆弧段...")
print("坐标系：Y轴向下为正")

# 第一段：从(0,0)开始，半径，45度，顺时针
first_segment = ArcSegment([0.0, 0.0], 32, 90, -1)

# 第二段：如有
# second_segment = ArcSegment(None, 20.0, 53.13011352, -1, first_segment)

# 将所有段放入列表
segments = [first_segment]

# 绘制所有圆弧段
plot_arc_segments(segments)