/*
 * Steam Buff
 * @Author : 顾青离
 * @Url    : sucaijun.com
 */
(() => {
  "use strict";

  function noise(index) {
    const value = Math.sin(index * 47.289 + 31.2) * 13897.538;
    return value - Math.floor(value);
  }

  const starLayers = [
    { count: 64, radius: .38, speed: .32, opacity: .43 },
    { count: 44, radius: .56, speed: .62, opacity: .64 },
    { count: 20, radius: .74, speed: 1.02, opacity: .88, trails: true },
  ].map(({ count, radius, speed, opacity, trails }, depth) => ({
    opacity, trails,
    stars: Array.from({ length: count }, (_, index) => {
      const seed = (depth * 64 + index) * 4;
      return {
        x: noise(seed), y: noise(seed + 1), speed: speed * (.82 + noise(seed + 2) * .46),
        radius: radius + noise(seed + 3) * .26,
      };
    }),
  }));

  const palette = [[190, 25, 51], [197, 43, 52], [213, 78, 64], [229, 81, 67], [245, 79, 69], [259, 80, 69], [273, 79, 62]];

  function mount(canvas, track, reducedMotion, signal) {
    const context = canvas.getContext("2d");
    let open = false, width = 0, height = 0, resolution = 1;
    let frame = 0, previousTime = 0, phase = 0, energy = 0, ratio = .5, colorRatio = .5;
    let target = palette.length - 1, color = target;

    function paint() {
      if (!context || !open || document.hidden || !width || !height) return;
      const slot = Math.floor(color), blend = color - slot;
      const [hue, saturation, brightness] = palette[slot].map((value, channel) =>
        value + (palette[Math.min(slot + 1, palette.length - 1)][channel] - value) * blend);
      const glowStrength = .35 + .65 * color / (palette.length - 1);
      const minimum = Math.min(32, width);
      const fillWidth = minimum + (width - minimum) * colorRatio;
      context.setTransform(resolution, 0, 0, resolution, 0, 0);
      context.globalAlpha = 1;
      const shade = context.createLinearGradient(0, height, fillWidth, 0);
      shade.addColorStop(0, "#21222a");
      shade.addColorStop(.19, "#252633");
      shade.addColorStop(.40, `hsl(${hue} 38% 36%)`);
      shade.addColorStop(.72, `hsl(${hue} ${saturation}% ${brightness}%)`);
      shade.addColorStop(1, `hsl(${hue} ${Math.min(100, saturation + 14)}% ${brightness + 14}%)`);
      context.globalCompositeOperation = "source-over";
      context.fillStyle = shade;
      context.fillRect(0, 0, width, height);

      const glowX = fillWidth * .70, glowY = height * .42;
      const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.min(58, fillWidth * .48));
      glow.addColorStop(0, `hsl(${hue + 12} 96% 86% / ${.34 * glowStrength})`);
      glow.addColorStop(1, "transparent");
      context.globalCompositeOperation = "screen";
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      // 光束和粒子完全离开轨道后再从另一侧进入。
      const sweepMargin = 82, sweepSpan = width + sweepMargin * 2;
      for (const offset of [0, sweepSpan / 2]) {
        const sweepX = (phase * 1.24 + offset) % sweepSpan - sweepMargin;
        if (sweepX + sweepMargin < 0 || sweepX - sweepMargin > fillWidth) continue;
        const sweep = context.createLinearGradient(sweepX - 68, height, sweepX + 68, 0);
        sweep.addColorStop(0, "transparent");
        sweep.addColorStop(.38, `hsl(${hue + 9} 92% 85% / .08)`);
        sweep.addColorStop(.57, `hsl(${hue + 17} 90% 90% / .27)`);
        sweep.addColorStop(1, "transparent");
        context.fillStyle = sweep;
        context.fillRect(0, 0, width, height);
      }

      const light = context.createLinearGradient(0, height, fillWidth, 0);
      light.addColorStop(0, `hsl(${hue} 54% 74% / .04)`);
      light.addColorStop(.45, `hsl(${hue + 6} 87% 83% / .20)`);
      light.addColorStop(1, `hsl(${hue + 14} 93% 91% / .24)`);
      context.strokeStyle = light;
      for (let band = 0; band < 7; band += 1) {
        context.beginPath();
        const vertical = (band + .5) * height / 7;
        for (let x = -24; x <= width + 24; x += 8) {
          const y = vertical + Math.sin((x - phase + band * 39) / 38) * 4.6 +
            Math.sin((x - phase * .48 + band * 23) / 19) * 1.9 - x / width * (3 + band % 3);
          if (x === -24) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.globalAlpha = .34;
        context.lineWidth = 5 + band % 3 * 1.5;
        context.stroke();
        context.globalAlpha = .76;
        context.lineWidth = 1 + band % 3 * .55;
        context.stroke();
      }

      const starMargin = 16, starSpan = width + starMargin * 2;
      const starLight = context.createLinearGradient(0, 0, fillWidth, 0);
      starLight.addColorStop(0, "transparent");
      starLight.addColorStop(.38, "#f0f4ff");
      starLight.addColorStop(.85, "#f0f4ff");
      starLight.addColorStop(1, "transparent");
      context.fillStyle = starLight;
      for (const layer of starLayers) {
        const trails = layer.trails ? new Path2D() : null;
        context.beginPath();
        for (const star of layer.stars) {
          const x = (star.x * starSpan + phase * star.speed) % starSpan - starMargin;
          const y = 2 + star.y * (height - 4) + Math.sin(phase / 64 + star.x * 8) * 1.2;
          context.moveTo(x + star.radius, y);
          context.arc(x, y, star.radius, 0, Math.PI * 2);
          if (trails) {
            trails.moveTo(x - star.radius, y);
            trails.lineTo(x - star.radius - (2.8 + energy * 3.6) * star.speed, y + .22);
          }
        }
        context.globalAlpha = layer.opacity * glowStrength;
        context.fill();
        if (trails) {
          context.globalAlpha = .35 * glowStrength;
          context.strokeStyle = starLight;
          context.lineWidth = .72;
          context.lineCap = "round";
          context.stroke(trails);
        }
      }

      const shadow = context.createLinearGradient(0, 0, fillWidth, 0);
      shadow.addColorStop(0, "#21222a");
      shadow.addColorStop(.14, "rgb(33 34 42 / .74)");
      shadow.addColorStop(.37, "transparent");
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.fillStyle = shadow;
      context.fillRect(0, 0, width, height);
    }

    function tick(timestamp) {
      frame = 0;
      if (!open || document.hidden || reducedMotion.matches) return;
      const delta = previousTime ? Math.min(34, timestamp - previousTime) : 0;
      previousTime = timestamp;
      colorRatio += (ratio - colorRatio) * Math.min(1, delta / 90);
      color += (target - color) * Math.min(1, delta / 90);
      if (Math.abs(target - color) < .001) color = target;
      phase += delta / 1000 * (13 + 47 * colorRatio) * (1 + 2.2 * energy);
      energy *= Math.exp(-delta / 220);
      paint();
      frame = requestAnimationFrame(tick);
    }

    function sync() {
      if (!open || document.hidden || reducedMotion.matches || !width) {
        if (frame) cancelAnimationFrame(frame);
        frame = previousTime = 0;
        if (reducedMotion.matches) { colorRatio = ratio; color = target; }
        paint();
      } else if (!frame) frame = requestAnimationFrame(tick);
    }

    const resize = new ResizeObserver(([entry]) => {
      if (!open) return;
      ({ width, height } = entry.contentRect);
      resolution = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.ceil(width * resolution);
      canvas.height = Math.ceil(height * resolution);
      paint();
      sync();
    });

    document.addEventListener("visibilitychange", sync, { signal });
    reducedMotion.addEventListener("change", sync, { signal });
    signal.addEventListener("abort", () => {
      open = false;
      resize.disconnect();
      sync();
    }, { once: true });

    return {
      setOpen(value) {
        open = value && Boolean(context);
        if (open) resize.observe(track);
        else {
          resize.disconnect();
          colorRatio = ratio;
          color = target;
          energy = 0;
        }
        sync();
      },
      setValue(value, speed, level) {
        ratio = value;
        const slot = Math.round(level * (palette.length - 1));
        if (slot !== target) {
          target = slot;
          const [hue, saturation, brightness] = palette[slot];
          track.style.setProperty("--composer-effort-color", slot === palette.length - 1
            ? "hsl(273 84% 62%)" : `hsl(${hue} ${saturation}% ${brightness}%)`);
        }
        energy = Math.max(energy, Math.min(1, Math.abs(speed) / 2.8));
        if (!frame) {
          colorRatio = value;
          color = target;
          paint();
        }
      },
    };
  }

  window.STChatEffortField = Object.freeze({ mount });
})();
