import pygame
import sys
import random

# 初始化 Pygame
pygame.init()

# -------------------- 常量设置 --------------------
WINDOW_WIDTH = 400
WINDOW_HEIGHT = 600
FPS = 60
GRAVITY = 0.5
JUMP_STRENGTH = -9
PIPE_WIDTH = 70
PIPE_GAP = 150
PIPE_FREQ = 1500          # 毫秒
GROUND_HEIGHT = 100

# 颜色
COLOR_SKY = (135, 206, 235)
COLOR_GROUND = (222, 184, 135)
COLOR_PIPE = (0, 150, 0)
COLOR_PIPE_EDGE = (0, 100, 0)
COLOR_BIRD = (255, 255, 0)

# -------------------- 游戏对象 --------------------
class Bird:
    def __init__(self):
        self.x = 100
        self.y = WINDOW_HEIGHT // 2
        self.vel_y = 0
        self.radius = 15

    def jump(self):
        self.vel_y = JUMP_STRENGTH

    def update(self):
        self.vel_y += GRAVITY
        self.y += self.vel_y

    def draw(self, screen):
        pygame.draw.circle(screen, COLOR_BIRD, (int(self.x), int(self.y)), self.radius)
        pygame.draw.circle(screen, (0, 0, 0), (int(self.x) + 5, int(self.y) - 5), 3)

    def get_rect(self):
        return pygame.Rect(self.x - self.radius, self.y - self.radius,
                           self.radius * 2, self.radius * 2)


class Pipe:
    def __init__(self, x):
        self.x = x
        self.height = random.randint(100, WINDOW_HEIGHT - GROUND_HEIGHT - PIPE_GAP - 100)
        self.passed = False

    def update(self):
        self.x -= 3

    def draw(self, screen):
        # 上管道
        pygame.draw.rect(screen, COLOR_PIPE, (self.x, 0, PIPE_WIDTH, self.height))
        pygame.draw.rect(screen, COLOR_PIPE_EDGE, (self.x, self.height - 30, PIPE_WIDTH, 30))
        # 下管道
        bottom_y = self.height + PIPE_GAP
        pygame.draw.rect(screen, COLOR_PIPE, (self.x, bottom_y, PIPE_WIDTH, WINDOW_HEIGHT - bottom_y))
        pygame.draw.rect(screen, COLOR_PIPE_EDGE, (self.x, bottom_y, PIPE_WIDTH, 30))

    def get_rects(self):
        top_rect = pygame.Rect(self.x, 0, PIPE_WIDTH, self.height)
        bottom_rect = pygame.Rect(self.x, self.height + PIPE_GAP, PIPE_WIDTH, WINDOW_HEIGHT)
        return top_rect, bottom_rect

    def off_screen(self):
        return self.x + PIPE_WIDTH < 0


# -------------------- 辅助函数 --------------------
def draw_ground(screen):
    pygame.draw.rect(screen, COLOR_GROUND, (0, WINDOW_HEIGHT - GROUND_HEIGHT, WINDOW_WIDTH, GROUND_HEIGHT))
    pygame.draw.line(screen, (100, 100, 100), (0, WINDOW_HEIGHT - GROUND_HEIGHT), (WINDOW_WIDTH, WINDOW_HEIGHT - GROUND_HEIGHT), 3)


def show_score(screen, score, font):
    score_surface = font.render(str(score), True, (255, 255, 255))
    score_rect = score_surface.get_rect(center=(WINDOW_WIDTH // 2, 60))
    screen.blit(score_surface, score_rect)


def game_over_screen(screen, score, font_big, font_small):
    # 半透明遮罩
    overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
    overlay.set_alpha(180)
    overlay.fill((0, 0, 0))
    screen.blit(overlay, (0, 0))

    game_over_text = font_big.render("GAME OVER", True, (255, 80, 80))
    score_text = font_small.render(f"Score: {score}", True, (255, 255, 255))
    restart_text = font_small.render("Press SPACE or Click to Restart", True, (200, 200, 200))

    screen.blit(game_over_text, game_over_text.get_rect(center=(WINDOW_WIDTH//2, 200)))
    screen.blit(score_text, score_text.get_rect(center=(WINDOW_WIDTH//2, 280)))
    screen.blit(restart_text, restart_text.get_rect(center=(WINDOW_WIDTH//2, 350)))
    pygame.display.flip()

    waiting = True
    while waiting:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                waiting = False
            if event.type == pygame.MOUSEBUTTONDOWN:
                waiting = False
        pygame.time.Clock().tick(30)


# -------------------- 主游戏函数 --------------------
def main():
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption("Flappy Bird")
    clock = pygame.time.Clock()
    font_small = pygame.font.Font(None, 36)
    font_big = pygame.font.Font(None, 60)

    while True:
        # ----- 初始化新游戏 -----
        bird = Bird()
        pipes = []
        score = 0
        last_pipe_time = pygame.time.get_ticks()
        running = True

        # ----- 主循环 -----
        while running:
            # 事件处理
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                    bird.jump()
                if event.type == pygame.MOUSEBUTTONDOWN:
                    bird.jump()

            # 更新游戏逻辑
            bird.update()

            # 管道生成
            now = pygame.time.get_ticks()
            if now - last_pipe_time > PIPE_FREQ:
                pipes.append(Pipe(WINDOW_WIDTH))
                last_pipe_time = now

            # 管道移动与删除
            for pipe in pipes[:]:
                pipe.update()
                if pipe.off_screen():
                    pipes.remove(pipe)

            # 碰撞检测
            bird_rect = bird.get_rect()
            # 边界碰撞（地面和天空）
            if bird.y + bird.radius >= WINDOW_HEIGHT - GROUND_HEIGHT or bird.y - bird.radius <= 0:
                running = False
            # 管道碰撞
            for pipe in pipes:
                top_rect, bottom_rect = pipe.get_rects()
                if bird_rect.colliderect(top_rect) or bird_rect.colliderect(bottom_rect):
                    running = False

            # 得分检测
            for pipe in pipes:
                if not pipe.passed and pipe.x + PIPE_WIDTH < bird.x:
                    pipe.passed = True
                    score += 1

            # 渲染画面
            screen.fill(COLOR_SKY)
            for pipe in pipes:
                pipe.draw(screen)
            draw_ground(screen)
            bird.draw(screen)
            show_score(screen, score, font_small)

            pygame.display.flip()
            clock.tick(FPS)

        # 游戏结束后的处理（重玩或退出）
        game_over_screen(screen, score, font_big, font_small)
        # 继续 while True 循环，重新开始游戏


if __name__ == "__main__":
    main()