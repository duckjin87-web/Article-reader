// Node.js script to generate PNG icons from SVG
// Run: node generate-icons.js
// Requires: npm install sharp (or use browser-based approach below)

// If sharp is not available, this HTML snippet can generate icons in browser:
const html = `
<!DOCTYPE html><html><body>
<canvas id="c192" width="192" height="192"></canvas>
<canvas id="c512" width="512" height="512"></canvas>
<script>
const svg = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <rect x="196" y="100" width="120" height="200" rx="60" fill="white" opacity=".95"/>
  <path d="M160 280 Q160 380 256 380 Q352 380 352 280" stroke="white" stroke-width="22" fill="none" stroke-linecap="round" opacity=".9"/>
  <line x1="256" y1="380" x2="256" y2="420" stroke="white" stroke-width="22" stroke-linecap="round" opacity=".9"/>
  <line x1="200" y1="420" x2="312" y2="420" stroke="white" stroke-width="22" stroke-linecap="round" opacity=".9"/>
  <path d="M120 200 Q80 256 120 312" stroke="#c4b5fd" stroke-width="16" fill="none" stroke-linecap="round" opacity=".8"/>
  <path d="M392 200 Q432 256 392 312" stroke="#c4b5fd" stroke-width="16" fill="none" stroke-linecap="round" opacity=".8"/>
</svg>\`;
const blob = new Blob([svg], {type:'image/svg+xml'});
const url  = URL.createObjectURL(blob);
const img  = new Image();
img.onload = () => {
  [192, 512].forEach(sz => {
    const c = document.getElementById('c'+sz);
    c.getContext('2d').drawImage(img, 0, 0, sz, sz);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'icon-'+sz+'.png';
    a.click();
  });
};
img.src = url;
<\/script></body></html>
`;

const fs = require('fs');
fs.writeFileSync('generate-icons.html', html);
console.log('Open generate-icons.html in a browser to download icon-192.png and icon-512.png');
console.log('Then place them in this directory.');
