
// ===============================
// ELEMENTOS DO DOM
// ===============================
const gameCanvas   = document.getElementById('gameCanvas');
const ctx          = gameCanvas.getContext('2d');
const textoFinal = document.getElementById('texto_final');
const startButton  = document.getElementById('startButton');
const scoreValue   = document.getElementById('scoreValue');
const timeValue    = document.getElementById('timeValue');
const scoreContainer = document.querySelector('.score-container');

// Fundo opcional (img no DOM)
const backgroundImageEl = document.getElementById('backgroundImage');

// Wobble da bolha (ondinha)
const WOBBLE_FREQ      = 0.0028; // velocidade da onda (↑ maior = mais rápido)
const WOBBLE_AMP_SCALE = 0.035;  // intensidade da escala X/Y (0.02–0.05 é sutil)
const WOBBLE_AMP_SHEAR = 0.025;  // intensidade do shear (0.015–0.03 é sutil)

// ===============================
// ESTADO GLOBAL
// ===============================
let bubbles = [];
let sunscreenItems = [];
let score = 0;
let gameTime = 20;
let gameTimer = null;
let animationFrameId = null;
let bubbleGenerationIntervalId = null;
let preStartTimeoutId = null;
let gameStarted = false;

// ===============================
// CONFIGS
// ===============================
const GAME_WIDTH  = 1080;  // 9:16 (bitmap)
const GAME_HEIGHT = 1920;


// Bolhas
const BUBBLE_RADIUS_MIN       = 140;
const BUBBLE_RADIUS_MAX       = 150;
const BUBBLE_SPAWN_INTERVAL   = 500; // ms
const MAX_BUBBLES             = 10;
const BUBBLE_LIFETIME = 900;
const FADE_OUT_DURATION = 300;
const BUBBLE_APPEAR_DURATION = 400;

// APNG de estouro
const POP_APNG_SRC        = 'images/gold-bubble.png'; // arquivo APNG (não GIF)
const POP_APNG_DURATION_MS= 500;                           // duração real da animação

// ===============================
// IMAGENS
// ===============================
const bubbleImage   = new Image();
const popAPNG       = new Image();
const productImages = [];
bubbleImage.src     = 'images/bubble.png';
for (let i = 1; i <= 4; i++) {
  const img = new Image();
  img.src = `images/product${i}.png`;
  productImages.push(img);
}
popAPNG.src         = POP_APNG_SRC;

function imagesReady() {
  const allProductsLoaded = productImages.every(img => img.complete && img.naturalWidth > 0);
  return (
    bubbleImage.complete && bubbleImage.naturalWidth > 0 &&
    allProductsLoaded &&
    popAPNG.complete && popAPNG.naturalWidth > 0
  );
}
// injeta CSS mínimo para o APNG
(function injectFXCSS(){
  const style = document.createElement('style');
  style.textContent = `
    .fx-apng{
      position:absolute;
      z-index:4;            /* acima do gameCanvas (z-index:3) */
      pointer-events:none;
      transform:translate(-50%, -50%);
      image-rendering:auto;
    }
  `;
  document.head.appendChild(style);
})();



// ===============================
// FUNÇÃO PARA CONTROLAR VISIBILIDADE DO SCORE
// ===============================
function setScoreContainerVisibility(visible) {
  if (scoreContainer) {
    scoreContainer.style.display = visible ? 'flex' : 'none';
  }
}

// ===============================
// RESIZE 9:16 (layout responsivo, bitmap fixo)
// ===============================
function resizeCanvas() {
  const aspect = 9 / 16;
  let width = window.innerWidth;
  let height = window.innerHeight;
  if (width / height > aspect) width = height * aspect;
  else height = width / aspect;

  // bitmap interno fixo do jogo
  gameCanvas.width = GAME_WIDTH;
  gameCanvas.height = GAME_HEIGHT;
  gameCanvas.style.width  = `${width}px`;
  gameCanvas.style.height = `${height}px`;

  // Se existir um canvas de máscara no DOM, mantém escalado junto
  const mask = document.getElementById('userMaskCanvas');
  if (mask) {
    mask.width = GAME_WIDTH;
    mask.height = GAME_HEIGHT;
    mask.style.width  = `${width}px`;
    mask.style.height = `${height}px`;
  }

  // Se quiser que qualquer outro elemento acompanhe o tamanho (ex: camadas)
  for (const el of [gameCanvas]) {
    if (!el) continue;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));
resizeCanvas();

// ===============================
// Helpers de limpeza/efeitos
// ===============================
function removeAllAPNGs() {
  document.querySelectorAll('.fx-apng').forEach(el => el.remove());
}

function showCardWithDelay() {
  const card = document.getElementById('card');
  if (!card) return;

  setTimeout(() => {
    // Mostra o card com fadeIn
    card.classList.add('show');
    card.classList.remove('hide');

    // Depois de 3s, faz fadeOut automático
    setTimeout(() => {
      card.classList.add('hide');
      card.classList.remove('show');
      document.getElementById('texto_final').style.display = 'none';


      // remove do fluxo após a transição (1s = tempo do CSS)
      setTimeout(() => {
   card.classList.remove('hide');
        // 👉 ZERA a pontuação aqui
        score = 0;
        scoreValue.textContent = score;

        // 👉 só aqui mostramos o botão iniciar de novo
      }, 1000);
    }, 3000);
  }, 6000);
}


function clearPlayfieldImmediate() {
  bubbles = [];
  sunscreenItems = [];
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  removeAllAPNGs();
}

/**
 * Anima todas as bolhas dando scale-down + fade e remove do canvas.
 * Retorna uma Promise que resolve ao final da animação.
 */
function animateAllBubblesOut(duration = 800) {
  return new Promise(resolve => {
    if (!bubbles.length && !sunscreenItems.length) {
      clearPlayfieldImmediate();
      resolve();
      return;
    }

    const start = performance.now();

    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const s = 1 - ease;                   // de 1 → 0
      const a = 1 - ease;                   // fade de 1 → 0

      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Desenha cada bolha encolhendo
      for (const b of bubbles) {
        const size = b.radius * 2;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(b.x, b.y);
        ctx.scale(Math.max(0, s), Math.max(0, s));
        ctx.drawImage(bubbleImage, -size / 2, -size / 2, size, size);
        ctx.restore();
      }

      // Também some rapidamente com os produtos solo
      for (const it of sunscreenItems) {
        ctx.save();
        ctx.globalAlpha = a * 0.8;
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rotationRad || 0);
        ctx.scale(Math.max(0, s), Math.max(0, s));
        //drawProductImage(ctx, sunscreenImage, it.size || 120);
        ctx.restore();
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        clearPlayfieldImmediate();
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function drawProductImage(ctx, img, maxSize) {
  const aspect = img.width / img.height;
  let drawW, drawH;
  if (aspect > 1) { 
    drawW = maxSize;
    drawH = maxSize / aspect;
  } else {
    drawH = maxSize;
    drawW = maxSize * aspect;
  }
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
}

// ===============================
// APNG helper (spawn na mesma posição/tamanho da bolha)
// ===============================
function spawnAPNGAtCanvas(xCanvas, yCanvas, sizeCanvas, durationMs = POP_APNG_DURATION_MS) {
  const container = document.querySelector('.game-container');

  // Converte coordenadas do bitmap 1080x1920 para %
  const leftPct  = (xCanvas / GAME_WIDTH) * 100;
  const topPct   = (yCanvas / GAME_HEIGHT) * 100;
  const widthPct = (sizeCanvas / GAME_WIDTH) * 100;

  const img = document.createElement('img');
  // Cache-buster para garantir que a animação sempre começa no frame 0
  img.src = `${POP_APNG_SRC}?t=${Date.now()}`;
  img.className = 'fx-apng';
  img.style.left = leftPct + '%';
  img.style.top = topPct + '%';
  img.style.width = widthPct + '%';
  img.style.height = 'auto';
  img.style.opacity = '1';

  container.appendChild(img);

  // Esconde um pouco antes do fim para não exibir o início do 2º loop do APNG
  const PRE_HIDE = 60; // ms antes do final (ajuste fino)
  const hideAt = Math.max(0, durationMs - PRE_HIDE);

  setTimeout(() => {
    img.style.transition = 'opacity 80ms linear';
    img.style.opacity = '0';
  }, hideAt);

  setTimeout(() => {
    img.remove();
  }, durationMs + 40);
}

// ===============================
// CLASSES
// ===============================
class SunscreenItem {
  constructor(x, y, size = 120, rotationDeg = -20, delay = 200, img) {
    this.x = x;
    this.y = y;
    this.size = size; // tamanho máx (lado maior) mantendo proporção
    this.rotationRad = rotationDeg * Math.PI / 180;
    this.img = img; 
    this.scale = 1;
    this.opacity = 1;

    // animação pós-delay
    this.fadeSpeed = 0.01;
    this.scaleSpeed = 0.03;
    this.finished = false;

    this.spawnTime = performance.now();
    this.delay = delay;      // 200ms parado
    this.animating = false;
  }

  update(now) {
    if (this.finished) return;

    if (!this.animating && now - this.spawnTime >= this.delay) {
      this.animating = true;
    }
    if (this.animating) {
      this.scale -= this.scaleSpeed;
      this.opacity -= this.fadeSpeed;
      if (this.scale <= 0 || this.opacity <= 0) this.finished = true;
    }
  }

  draw() {
    if (this.finished) return;

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotationRad);
    ctx.scale(this.scale, this.scale);
    drawProductImage(ctx, this.img, this.size);
    ctx.restore();
  }
}

class Bubble {
  constructor() {
    const margin = BUBBLE_RADIUS_MAX + 20;
    this.radius = Math.random() * (BUBBLE_RADIUS_MAX - BUBBLE_RADIUS_MIN) + BUBBLE_RADIUS_MIN;
    this.x = Math.random() * (GAME_WIDTH - margin * 2) + margin;

    // margem superior e inferior ~10% da area util
    const verticalMargin = GAME_HEIGHT * 0.13; 
    this.y = Math.random() * (GAME_HEIGHT - margin * 2 - verticalMargin * 2) + margin + verticalMargin;
    
    // vida: apenas APPEAR (sem fade automático)
    this.startMs = performance.now();
    this.entryScale = 0;
    this.opacity = 0;
    this.animationOffset = Math.random() * Math.PI * 2;
    this.wPhaseA = Math.random() * Math.PI * 2;
    this.wPhaseB = Math.random() * Math.PI * 2;
    this.wPhaseC = Math.random() * Math.PI * 2;
    this.wPhaseD = Math.random() * Math.PI * 2;

    this.popped = false;
    this.finished = false;

    // escala visual (guarda para casar com o APNG)
    this.visualScale = 1;

    // sorteia qual produto vai aparecer
    this.productImg = productImages[Math.floor(Math.random() * productImages.length)];
    
  }

  update() {
    if (this.finished) return;

    if (this.popped) {
      this.finished = true;
      return;
    }

    const age = performance.now() - this.startMs;

    if (age <= BUBBLE_APPEAR_DURATION) {
      const t = age / BUBBLE_APPEAR_DURATION;
      const easeOut = 1 - Math.pow(1 - t, 3);
      this.entryScale = easeOut;
      this.opacity = easeOut;
    } else if (age > BUBBLE_LIFETIME - FADE_OUT_DURATION) {
    // Lógica de SAÍDA (Fade-out / Scale-down)
    const timeInFade = age - (BUBBLE_LIFETIME - FADE_OUT_DURATION);
    const t = Math.min(1, timeInFade / FADE_OUT_DURATION);
    const easeIn = Math.pow(t, 3); // Começa devagar e acelera
    this.entryScale = 1 - easeIn;
    this.opacity = 1 - easeIn;
    
    // Se terminou o fade out, marca para remover
    if (age >= BUBBLE_LIFETIME) {
        this.popped = true; 
    }
} else {
    // Estado ESTÁVEL (Totalmente visível)
    this.entryScale = 1;
    this.opacity = 1;
}
  }

  draw(now) {
    if (this.finished || this.popped) return;

    // respiração sutil (pulse)
    const tt = (Number.isFinite(now) ? now : performance.now()) * 0.003;
    const pulse = 1 + Math.sin(tt + this.animationOffset) * 0.03;
    const s = this.entryScale * pulse;
    this.visualScale = s; // usado para casar o APNG no pop

    // -------- 1) BOLHA com wobble --------
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y);
    ctx.scale(s, s);

    const t = (Number.isFinite(now) ? now : performance.now());
    const w = t * WOBBLE_FREQ;
    const sxW = 1 + Math.sin(w + this.wPhaseA) * WOBBLE_AMP_SCALE;
    const syW = 1 + Math.sin(w * 1.35 + this.wPhaseB) * (WOBBLE_AMP_SCALE * 0.85);
    const shx = Math.sin(w * 0.8 + this.wPhaseC) * WOBBLE_AMP_SHEAR;
    const shy = Math.sin(w * 1.1 + this.wPhaseD) * (WOBBLE_AMP_SHEAR * 0.7);

    // aplica ondulação somente na bolha
    ctx.transform(sxW, shy, shx, syW, 0, 0);

    const size = this.radius * 2;
    ctx.drawImage(bubbleImage, -this.radius, -this.radius, size, size);
    ctx.restore();

  }

  isClicked(tx, ty) {
    if (this.finished || this.popped || this.opacity < 0.05) return false;
    const dx = tx - this.x, dy = ty - this.y;
    const r = this.radius * Math.max(0.001, this.entryScale);
    return (dx*dx + dy*dy) < (r*r);
  }

  pop() {
    if (this.popped) return;
    this.popped = true;

    // cria produto “solo”, 0.2s parado e depois scale down + fade out
    const poppedMax = this.radius * 1.25;
    const item = new SunscreenItem(this.x, this.y, 160, -20, 300, this.productImg);
    sunscreenItems.push(item);

    // APNG exatamente no mesmo centro e com o mesmo diâmetro visível
    const diameterCanvas = this.radius * 2 * this.visualScale;
    spawnAPNGAtCanvas(this.x, this.y, diameterCanvas);
  }
}

// ===============================
// JOGO
// ===============================
function generateBubble() {
  if (!gameStarted || !imagesReady()) return;
  if (bubbles.length >= MAX_BUBBLES) return;
  bubbles.push(new Bubble());
}

function drawBackgroundIfAny() {
     ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

}

function gameLoop(now) {
  // fundo (imagem opcional ou clear)
  drawBackgroundIfAny();

  // Bolhas
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.update();
    b.draw(now);
    if (b.finished) bubbles.splice(i, 1);
  }
  
  // Produtos “solo”
  for (let i = sunscreenItems.length - 1; i >= 0; i--) {
    const s = sunscreenItems[i];
    s.update(now);
    s.draw();
    if (s.finished) sunscreenItems.splice(i, 1);
  }
  
}

// ===== Game flow =====
function startGame() {
  document.getElementById('texto_final')?.style && (document.getElementById('texto_final').style.display = 'none');
 
  // limpa restos anteriores
  if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
  if (bubbleGenerationIntervalId) { clearInterval(bubbleGenerationIntervalId); bubbleGenerationIntervalId = null; }
  if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
  if (preStartTimeoutId) { clearTimeout(preStartTimeoutId); preStartTimeoutId = null; }

  // remove mensagens e botões
  const endMsg = document.getElementById('endMessage');
  if (endMsg) endMsg.remove();

  // estado inicial
  score = 0;
  gameTime = 20;
  scoreValue.textContent = score;
  timeValue.textContent = gameTime;

  // LIMPA QUALQUER COISA QUE TENHA FICADO NO CANVAS
  clearPlayfieldImmediate();
document.getElementById("bolhaPrincipal").style.display = "none";

  setScoreContainerVisibility(true);

  preStartTimeoutId = setTimeout(() => {
    preStartTimeoutId = null;
    

    // agora, sim, inicia a rodada
    bubbles = [];
    sunscreenItems = [];
    gameStarted = true;

    // cronômetro
    gameTimer = setInterval(() => {
      if (!gameStarted) return;
      gameTime -= 1;
      timeValue.textContent = gameTime;
      if (gameTime <= 0) endGame();
    }, 1000);

    // spawner de bolhas
    bubbleGenerationIntervalId = setInterval(generateBubble, BUBBLE_SPAWN_INTERVAL);

    // loop de render
    const tick = (now) => {
      if (!gameStarted) return;
      gameLoop(now);
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
  }, 0);
}

async function endGame() {
  if (!gameStarted) return;
  gameStarted = false;

  // para loops
  if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
  if (bubbleGenerationIntervalId) { clearInterval(bubbleGenerationIntervalId); bubbleGenerationIntervalId = null; }
  if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

  // anima TODAS as bolhas/itens sumindo e limpa
  await animateAllBubblesOut(420);

  // mensagem final
  const finalScore = score;

  // Esconde qualquer mensagem antiga
  const oldMsg = document.getElementById('endMessage');
  if (oldMsg) oldMsg.remove();

 

  // Mostra imagem final
    document.getElementById('texto_final').style.display = 'block';
 
showCardWithDelay();
  // Mostra botão de reinício
}

// ===============================
// INPUT
// ===============================
function handleTouch(event) {
  event.preventDefault();
  const rect = gameCanvas.getBoundingClientRect();
  const scaleX = gameCanvas.width / rect.width;
  const scaleY = gameCanvas.height / rect.height;

  let tx, ty;
  if (event.touches && event.touches.length > 0) {
    tx = (event.touches[0].clientX - rect.left) * scaleX;
    ty = (event.touches[0].clientY - rect.top) * scaleY;
  } else {
    tx = (event.clientX - rect.left) * scaleX;
    ty = (event.clientY - rect.top) * scaleY;
  }

  for (let i = bubbles.length - 1; i >= 0; i--) {
    if (bubbles[i].isClicked(tx, ty)) {
      bubbles[i].pop();
      score += 1;
      scoreValue.textContent = score;
      break;
    }
  }
}
gameCanvas.addEventListener('touchstart', handleTouch, { passive: false });
gameCanvas.addEventListener('mousedown', handleTouch);

// Previne zoom por gesto e seleção
document.addEventListener('touchmove', (e) => { if (e.scale !== 1) e.preventDefault(); }, { passive: false });
document.addEventListener('selectstart', (e) => e.preventDefault());
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

// ===============================
// BOTÕES E INICIALIZAÇÃO
// ===============================
if (startButton) {
  startButton.addEventListener('click', () => {
    if (!gameStarted) {
      startButton.disabled = true;
      startButton.style.display = 'none';
      startGame();
    }
  });
}


window.addEventListener('load', async () => {
  try {
    // aguarda imagens do jogo (bolha, produto, apng)
    while (!imagesReady()) await new Promise(r => setTimeout(r, 60));
    if (startButton) {
      startButton.disabled = false;
      startButton.style.display = 'inline-block';
    }
  } catch (err) {
    console.error('Falha ao inicializar:', err);
    if (startButton) {
      startButton.disabled = false;
      startButton.style.display = 'inline-block';
    }
  }
});