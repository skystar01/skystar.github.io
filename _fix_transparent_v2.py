"""把 12 个 sprite 的边缘背景像素 alpha=0 (floodfill from edges by color similarity).

策略:
- 取整张图边缘一圈像素的中位数作为"背景代表色"
- 从四边 floodfill, 所有和背景色欧氏距离 < threshold 的连续区域 → alpha=0
- 主体 (中心, 颜色和边缘背景差距大) 不被吃
- 主体边缘过渡区可能被"羽化"掉, 反而让 sprite 边缘自然过渡到背景

阈值: 50 起步, 太严可以放宽
"""
from PIL import Image
import numpy as np
from collections import deque
from pathlib import Path

ASSET_DIR = Path(r"D:\program_file\skystar_personal_website\assets\survivor")
FILES = [
    "player.png", "boss.png",
    "enemy-normal.png", "enemy-bomb.png", "enemy-poison.png",
    "enemy-shield.png", "enemy-blackhole.png",
    "bullet-dart.png", "bullet-bomb.png", "bullet-poison.png",
    "bullet-scatter.png", "bullet-snow.png",
]
THRESHOLD = 50  # 欧氏距离, 越小越严


def make_transparent(path, threshold=THRESHOLD):
    im = Image.open(path).convert("RGB")
    arr = np.array(im)
    h, w = arr.shape[:2]

    # 边缘一圈像素
    edge_pixels = np.concatenate([
        arr[0, :, :], arr[-1, :, :],
        arr[:, 0, :], arr[:, -1, :]
    ], axis=0)

    # 中位数作为"背景代表色"
    bg_color = np.median(edge_pixels, axis=0)

    # 每个像素到 bg_color 的欧氏距离
    diff = arr.astype(np.float32) - bg_color.astype(np.float32)
    dist = np.sqrt(np.sum(diff * diff, axis=2))

    # floodfill
    is_bg = dist < threshold
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    for x in range(w):
        for y in (0, h - 1):
            if is_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_bg[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    # 写 RGBA
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = arr
    out[:, :, 3] = np.where(visited, 0, 255)
    Image.fromarray(out, "RGBA").save(path, "PNG")

    bg_pixel_count = int(visited.sum())
    return bg_pixel_count, h * w, bg_color.astype(int).tolist()


def main():
    print(f"Threshold: {THRESHOLD} (Euclidean distance)\n")
    for f in FILES:
        p = ASSET_DIR / f
        if not p.exists():
            print(f"  SKIP {f} (not found)")
            continue
        n, total, bg = make_transparent(p)
        pct = n / total * 100
        print(f"  {f}: bg_color={bg}  transparent={n}/{total} ({pct:.1f}%)")


if __name__ == "__main__":
    main()
