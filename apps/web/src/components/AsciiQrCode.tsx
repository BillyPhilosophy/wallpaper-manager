import { useEffect, useRef } from 'react';

export function AsciiQrCode({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lines = value.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
    const columns = Math.max(0, ...lines.map((line) => Math.floor(line.length / 2)));
    const scale = 8;
    canvas.width = columns * scale;
    canvas.height = lines.length * scale;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    lines.forEach((line, y) => {
      for (let x = 0; x < columns; x++) {
        if (line.slice(x * 2, x * 2 + 2) === '██') context.fillRect(x * scale, y * scale, scale, scale);
      }
    });
  }, [value]);
  return <canvas ref={canvasRef} className="steam-qr" role="img" aria-label="Steam 登录二维码"/>;
}
