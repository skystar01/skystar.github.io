import pygame
import sys
import random
from collections import deque

pygame.init()

# -------------------- 游戏常量 --------------------
WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
CELL_SIZE = 20
CELL_X = WINDOW_WIDTH // CELL_SIZE
CELL_Y = WINDOW_HEIGHT // CELL_SIZE

FPS = 8            
MAX_FPS = 40        
AI_FPS = 60        
SPEED_INCREASE_SCORE = 30

# 颜色方案
COLOR_BG_DARK = (15, 23, 42)
COLOR_BG_LIGHT = (25, 35, 55)
COLOR_GRID = (30, 45, 65)
COLOR_SNAKE_HEAD = (34, 197, 94)
COLOR_SNAKE_HEAD_GLOW = (48, 211, 99)
COLOR_SNAKE_BODY = (22, 163, 74)
COLOR_SNAKE_BODY_DARK = (16, 128, 59)
COLOR_FOOD = (239, 68, 68)
COLOR_FOOD_GLOW = (248, 113, 113)
COLOR_TEXT = (226, 232, 240)
COLOR_SCORE = (250, 204, 21)
COLOR_OVER = (239, 68, 68)
COLOR_BUTTON = (59, 130, 246)
COLOR_BUTTON_HOVER = (66, 153, 225)
COLOR_AI_ON = (34, 197, 94)
COLOR_AI_OFF = (249, 115, 22)

INIT_DIRECTION = (CELL_SIZE, 0)
DIRECTIONS = [(0, -CELL_SIZE), (0, CELL_SIZE), (-CELL_SIZE, 0), (CELL_SIZE, 0)]

# 字体
FONT_SMALL = pygame.font.Font(None, 20)
FONT_MEDIUM = pygame.font.Font(None, 28)
FONT_BIG = pygame.font.Font(None, 56)
FONT_TITLE = pygame.font.Font(None, 72)

# -------------------- 工具函数 --------------------
def draw_gradient_bg(screen):
    """绘制渐变背景"""
    for y in range(WINDOW_HEIGHT):
        ratio = y / WINDOW_HEIGHT
        r = int(COLOR_BG_DARK[0] * (1 - ratio) + COLOR_BG_LIGHT[0] * ratio)
        g = int(COLOR_BG_DARK[1] * (1 - ratio) + COLOR_BG_LIGHT[1] * ratio)
        b = int(COLOR_BG_DARK[2] * (1 - ratio) + COLOR_BG_LIGHT[2] * ratio)
        pygame.draw.line(screen, (r, g, b), (0, y), (WINDOW_WIDTH, y))

def draw_grid(screen):
    """绘制网格线"""
    for x in range(0, WINDOW_WIDTH, CELL_SIZE):
        pygame.draw.line(screen, COLOR_GRID, (x, 0), (x, WINDOW_HEIGHT), 1)
    for y in range(0, WINDOW_HEIGHT, CELL_SIZE):
        pygame.draw.line(screen, COLOR_GRID, (0, y), (WINDOW_WIDTH, y), 1)

def show_text(screen, text, font, color, center_pos, shadow=True):
    """显示文字，带阴影效果"""
    if shadow:
        shadow_surface = font.render(text, True, (0, 0, 0, 128))
        shadow_rect = shadow_surface.get_rect(center=(center_pos[0]+2, center_pos[1]+2))
        screen.blit(shadow_surface, shadow_rect)
    
    surface = font.render(text, True, color)
    rect = surface.get_rect(center=center_pos)
    screen.blit(surface, rect)

def generate_food(snake):
    """生成食物位置"""
    while True:
        x = random.randint(0, CELL_X - 1) * CELL_SIZE
        y = random.randint(0, CELL_Y - 1) * CELL_SIZE
        food_pos = (x, y)
        if food_pos not in snake:
            return food_pos

def draw_button(screen, text, rect, color, hover_color, click_event):
    """绘制按钮"""
    mouse_pos = pygame.mouse.get_pos()
    is_hovered = rect.collidepoint(mouse_pos)
    
    current_color = hover_color if is_hovered else color
    
    # 按钮阴影
    shadow_rect = pygame.Rect(rect.x + 3, rect.y + 3, rect.width, rect.height)
    pygame.draw.rect(screen, (0, 0, 0, 50), shadow_rect, border_radius=12)
    
    # 按钮主体（带渐变）
    pygame.draw.rect(screen, current_color, rect, border_radius=12)
    
    # 按钮高光
    highlight_surface = pygame.Surface((rect.width, rect.height))
    highlight_surface.fill((255, 255, 255, 30))
    highlight_surface.set_alpha(30)
    screen.blit(highlight_surface, rect)
    
    # 按钮边框
    pygame.draw.rect(screen, (255, 255, 255, 50), rect, 2, border_radius=12)
    
    # 按钮文字
    text_surface = FONT_MEDIUM.render(text, True, (255, 255, 255))
    text_rect = text_surface.get_rect(center=rect.center)
    screen.blit(text_surface, text_rect)
    
    return is_hovered and click_event

def game_over_screen(screen, score):
    """游戏结束画面"""
    restart_rect = pygame.Rect(WINDOW_WIDTH // 2 - 120, WINDOW_HEIGHT // 2 + 30, 240, 60)
    quit_rect = pygame.Rect(WINDOW_WIDTH // 2 - 120, WINDOW_HEIGHT // 2 + 110, 240, 60)
    
    while True:
        click_event = False
        
        for event in pygame.event.get():
            if event.type == pygame.QUIT: 
                return False
            if event.type == pygame.KEYDOWN:
                if event.key in (pygame.K_r, pygame.K_RETURN): 
                    return True
                elif event.key in (pygame.K_ESCAPE, pygame.K_q): 
                    return False
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1: 
                click_event = True
        
        # 绘制背景
        draw_gradient_bg(screen)
        
        # 游戏结束标题
        show_text(screen, "Game Over", FONT_TITLE, COLOR_OVER, (WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 80))
        show_text(screen, f"Final Score: {score}", FONT_MEDIUM, COLOR_SCORE, (WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 - 20))
        
        # 按钮
        if draw_button(screen, "Play Again (R/Enter)", restart_rect, COLOR_BUTTON, COLOR_BUTTON_HOVER, click_event): 
            return True
        if draw_button(screen, "Exit (ESC/Q)", quit_rect, (180, 70, 70), (210, 100, 100), click_event): 
            return False
        
        pygame.display.flip()
        pygame.time.Clock().tick(30)

# -------------------- AI 算法 --------------------
def bfs(start, goal, obstacles, max_steps=None):
    if start == goal:
        return [start]
    queue = deque([start])
    visited = {start}
    parent = {start: None}
    steps = 0
    while queue and (max_steps is None or steps < max_steps):
        current = queue.popleft()
        steps += 1
        for dx, dy in DIRECTIONS:
            nx, ny = current[0] + dx, current[1] + dy
            next_pos = (nx, ny)
            if 0 <= nx < WINDOW_WIDTH and 0 <= ny < WINDOW_HEIGHT:
                if next_pos not in obstacles and next_pos not in visited:
                    visited.add(next_pos)
                    parent[next_pos] = current
                    if next_pos == goal:
                        path = []
                        while next_pos:
                            path.append(next_pos)
                            next_pos = parent[next_pos]
                        return path[::-1]
                    queue.append(next_pos)
    return None

def flood_fill(start, obstacles):
    visited = {start}
    queue = deque([start])
    count = 0
    while queue:
        current = queue.popleft()
        count += 1
        for dx, dy in DIRECTIONS:
            nx, ny = current[0] + dx, current[1] + dy
            next_pos = (nx, ny)
            if 0 <= nx < WINDOW_WIDTH and 0 <= ny < WINDOW_HEIGHT:
                if next_pos not in obstacles and next_pos not in visited:
                    visited.add(next_pos)
                    queue.append(next_pos)
    return count

def is_safe_move(head, new_head, snake, food):
    if not (0 <= new_head[0] < WINDOW_WIDTH and 0 <= new_head[1] < WINDOW_HEIGHT):
        return False
    if new_head in snake and new_head != snake[-1]:
        return False

    new_snake = [new_head] + snake[:-1]
    if new_head == food:
        new_snake = [new_head] + snake
    new_obstacles = set(new_snake)

    free_space = flood_fill(new_head, new_obstacles)
    if free_space < len(new_snake):
        return False
    return True

def get_ai_direction(snake, food, current_direction):
    head = snake[0]
    snake_set = set(snake)
    best_dir = current_direction
    best_score = -float('inf')

    food_path = bfs(head, food, snake_set)

    for dx, dy in DIRECTIONS:
        new_head = (head[0] + dx, head[1] + dy)

        if not is_safe_move(head, new_head, snake, food):
            continue

        score = 0
        if food_path and new_head == food_path[1] and len(food_path) > 1:
            score += 200
        else:
            new_obstacles = set([new_head] + snake[:-1]) if new_head != food else set([new_head] + snake)
            dist = bfs(new_head, food, new_obstacles, max_steps=200)
            if dist:
                score -= len(dist) * 5
            else:
                score -= 500

        new_snake_temp = [new_head] + snake[:-1] if new_head != food else [new_head] + snake
        free_space = flood_fill(new_head, set(new_snake_temp))
        score += free_space * 2

        if (dx, dy) == current_direction:
            score += 50

        if score > best_score:
            best_score = score
            best_dir = (dx, dy)

    return best_dir

# -------------------- 游戏主函数 --------------------
def game_loop():
    global FPS
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption("🐍 Snake Game")
    clock = pygame.time.Clock()
    
    snake = [
        (5 * CELL_SIZE, 10 * CELL_SIZE),
        (4 * CELL_SIZE, 10 * CELL_SIZE),
        (3 * CELL_SIZE, 10 * CELL_SIZE)
    ]
    
    direction = INIT_DIRECTION
    direction_queue = deque(maxlen=3)
    
    food = generate_food(snake)
    score = 0
    running = True
    paused = False
    ai_mode = False  
    food_glow_intensity = 0
    food_glow_direction = 1
    
    while running:
        current_fps = AI_FPS if ai_mode else FPS
        
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    paused = not paused
                elif event.key == pygame.K_m:
                    ai_mode = not ai_mode
                    direction_queue.clear()
                
                if not ai_mode:
                    new_dir = None
                    if event.key in (pygame.K_w, pygame.K_UP): new_dir = (0, -CELL_SIZE)
                    elif event.key in (pygame.K_s, pygame.K_DOWN): new_dir = (0, CELL_SIZE)
                    elif event.key in (pygame.K_a, pygame.K_LEFT): new_dir = (-CELL_SIZE, 0)
                    elif event.key in (pygame.K_d, pygame.K_RIGHT): new_dir = (CELL_SIZE, 0)
                    
                    if new_dir:
                        check_dir = direction_queue[-1] if direction_queue else direction
                        if new_dir[0] + check_dir[0] != 0 or new_dir[1] + check_dir[1] != 0:
                            if new_dir != check_dir:
                                direction_queue.append(new_dir)

        if paused:
            draw_gradient_bg(screen)
            show_text(screen, "Paused", FONT_TITLE, COLOR_TEXT, (WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2))
            show_text(screen, "Press Space to continue", FONT_MEDIUM, COLOR_TEXT, (WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2 + 60))
            pygame.display.flip()
            clock.tick(current_fps)
            continue

        if ai_mode:
            direction_queue.clear()
            ai_dir = get_ai_direction(snake, food, direction)
            direction_queue.append(ai_dir)

        if direction_queue:
            direction = direction_queue.popleft()
        
        head_x, head_y = snake[0]
        new_head = (head_x + direction[0], head_y + direction[1])
        
        if (new_head[0] < 0 or new_head[0] >= WINDOW_WIDTH or 
            new_head[1] < 0 or new_head[1] >= WINDOW_HEIGHT):
            break
        
        if new_head in snake:
            break
        
        snake.insert(0, new_head)
        
        if new_head == food:
            score += 10
            food = generate_food(snake)
            if not ai_mode and score % SPEED_INCREASE_SCORE == 0 and FPS < MAX_FPS:
                FPS += 1
        else:
            snake.pop()
        
        # 绘制
        draw_gradient_bg(screen)
        draw_grid(screen)
        
        # 食物发光效果
        food_glow_intensity += 0.05 * food_glow_direction
        if food_glow_intensity >= 1 or food_glow_intensity <= 0:
            food_glow_direction *= -1
        
        glow_radius = int(CELL_SIZE * 1.5 + food_glow_intensity * 5)
        glow_surface = pygame.Surface((glow_radius * 2, glow_radius * 2), pygame.SRCALPHA)
        pygame.draw.circle(glow_surface, (239, 68, 68, int(50 * food_glow_intensity)), 
                          (glow_radius, glow_radius), glow_radius)
        screen.blit(glow_surface, (food[0] + CELL_SIZE//2 - glow_radius, 
                                   food[1] + CELL_SIZE//2 - glow_radius))
        
        # 食物（圆形）
        pygame.draw.circle(screen, COLOR_FOOD, 
                          (food[0] + CELL_SIZE//2, food[1] + CELL_SIZE//2), 
                          CELL_SIZE//2 - 2)
        pygame.draw.circle(screen, COLOR_FOOD_GLOW, 
                          (food[0] + CELL_SIZE//2, food[1] + CELL_SIZE//2), 
                          CELL_SIZE//2 - 4)
        
        # 蛇（带渐变和眼睛）
        for i, segment in enumerate(snake):
            if i == 0:
                # 蛇头
                gradient = pygame.Surface((CELL_SIZE, CELL_SIZE))
                pygame.draw.rect(gradient, COLOR_SNAKE_HEAD, (0, 0, CELL_SIZE, CELL_SIZE))
                gradient.fill((255, 255, 255, 20), special_flags=pygame.BLEND_RGB_ADD)
                screen.blit(gradient, segment)
                
                # 蛇头边框
                pygame.draw.rect(screen, COLOR_SNAKE_HEAD_GLOW, segment + (CELL_SIZE, CELL_SIZE), 2)
                
                # 蛇眼睛
                eye_offset = 4
                if direction == (CELL_SIZE, 0):  # 向右
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+CELL_SIZE-6, segment[1]+eye_offset), 3)
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+CELL_SIZE-6, segment[1]+CELL_SIZE-eye_offset), 3)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+CELL_SIZE-5, segment[1]+eye_offset), 1)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+CELL_SIZE-5, segment[1]+CELL_SIZE-eye_offset), 1)
                elif direction == (-CELL_SIZE, 0):  # 向左
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+6, segment[1]+eye_offset), 3)
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+6, segment[1]+CELL_SIZE-eye_offset), 3)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+5, segment[1]+eye_offset), 1)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+5, segment[1]+CELL_SIZE-eye_offset), 1)
                elif direction == (0, -CELL_SIZE):  # 向上
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+eye_offset, segment[1]+6), 3)
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+CELL_SIZE-eye_offset, segment[1]+6), 3)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+eye_offset, segment[1]+5), 1)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+CELL_SIZE-eye_offset, segment[1]+5), 1)
                else:  # 向下
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+eye_offset, segment[1]+CELL_SIZE-6), 3)
                    pygame.draw.circle(screen, (255, 255, 255), (segment[0]+CELL_SIZE-eye_offset, segment[1]+CELL_SIZE-6), 3)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+eye_offset, segment[1]+CELL_SIZE-5), 1)
                    pygame.draw.circle(screen, (0, 0, 0), (segment[0]+CELL_SIZE-eye_offset, segment[1]+CELL_SIZE-5), 1)
            else:
                # 蛇身渐变效果
                body_ratio = i / len(snake)
                r = int(COLOR_SNAKE_BODY[0] * (1 - body_ratio) + COLOR_SNAKE_BODY_DARK[0] * body_ratio)
                g = int(COLOR_SNAKE_BODY[1] * (1 - body_ratio) + COLOR_SNAKE_BODY_DARK[1] * body_ratio)
                b = int(COLOR_SNAKE_BODY[2] * (1 - body_ratio) + COLOR_SNAKE_BODY_DARK[2] * body_ratio)
                body_color = (r, g, b)
                
                pygame.draw.rect(screen, body_color, segment + (CELL_SIZE, CELL_SIZE))
                pygame.draw.rect(screen, (0, 0, 0, 30), segment + (CELL_SIZE, CELL_SIZE), 1)
        
        # UI：右上角分数面板（半透明背景）
        score_text = FONT_SMALL.render(f"{score}", True, COLOR_SCORE)
        score_label = FONT_SMALL.render("Score", True, COLOR_TEXT)
        
        ui_width = max(score_text.get_width(), score_label.get_width()) + 10
        ui_bg = pygame.Surface((ui_width, 45), pygame.SRCALPHA)
        ui_bg.fill((0, 0, 0, 30))
        screen.blit(ui_bg, (WINDOW_WIDTH - ui_width - 10, 10))
        screen.blit(score_label, (WINDOW_WIDTH - ui_width - 5, 10))
        screen.blit(score_text, (WINDOW_WIDTH - ui_width - 5, 26))
        
        # UI：左上角AI状态（文字显示，避免图标显示问题）
        ai_text_str = "AI" if ai_mode else "PLAYER"
        ai_color = COLOR_AI_ON if ai_mode else COLOR_AI_OFF
        ai_text = FONT_SMALL.render(ai_text_str, True, ai_color)
        
        ai_bg = pygame.Surface((ai_text.get_width() + 10, 26), pygame.SRCALPHA)
        ai_bg.fill((0, 0, 0, 30))
        screen.blit(ai_bg, (5, 5))
        screen.blit(ai_text, (10, 7))
        
        # UI：底部提示（半透明背景）
        tip_text = FONT_SMALL.render("WASD/Arrows: Move | Space: Pause | M: AI", True, COLOR_TEXT)
        tip_bg = pygame.Surface((tip_text.get_width() + 10, 24), pygame.SRCALPHA)
        tip_bg.fill((0, 0, 0, 25))
        screen.blit(tip_bg, (WINDOW_WIDTH - tip_text.get_width() - 15, WINDOW_HEIGHT - 28))
        screen.blit(tip_text, (WINDOW_WIDTH - tip_text.get_width() - 10, WINDOW_HEIGHT - 26))
        
        pygame.display.flip()
        clock.tick(current_fps)
    
    return game_over_screen(screen, score)

# -------------------- 程序入口 --------------------
def main():
    while True:
        if not game_loop():
            break
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()