# Better Vibe Website

Landing page for the Better Vibe organization, featuring Branch Narrator and future products.

## Development

```bash
# Navigate to website directory
cd website

# Install dependencies (if any)
bun install

# Start development server
bun run dev
# Opens at http://localhost:3000

# Build for production
NODE_ENV=production bun run build
# Output in ./dist
```

## Structure

```
website/
├── index.html          # Main HTML file
├── styles/
│   └── main.css        # All styles with CSS custom properties
├── scripts/
│   └── main.js         # Interactive features
├── assets/             # Images, fonts, etc. (add as needed)
├── serve.js            # Development server
├── build.js            # Build script
├── robots.txt          # SEO
├── sitemap.xml         # SEO
└── package.json        # Scripts and metadata
```

## Design Features

This landing page includes award-winning design elements:

- **Dark Theme**: Sophisticated noir aesthetic with purple accent gradients
- **Noise Overlay**: Subtle texture for depth
- **Cursor Glow**: Ambient light following the cursor (desktop only)
- **Scroll Reveal**: Elements animate in as you scroll
- **Marquee**: Infinite scroll banner highlighting key features
- **Terminal Animation**: Typing effect for the terminal demo
- **Glassmorphism**: Frosted glass navigation on scroll
- **Custom Properties**: Fully themeable via CSS variables
- **Responsive**: Mobile-first, works on all devices
- **Accessible**: Respects `prefers-reduced-motion`, proper focus states
- **Performance**: Pauses animations when tab is hidden

## Sections

1. **Hero**: Brand statement with animated typography
2. **Marquee**: Key differentiators
3. **Products**: Featured product (Branch Narrator) + coming soon cards
4. **Deep Dive**: Feature grid with code showcase tabs
5. **About**: Company principles and values
6. **CTA**: Installation command with copy button
7. **Footer**: Links and copyright

## Customization

### Colors

Edit CSS custom properties in `styles/main.css`:

```css
:root {
  --color-accent: #8b5cf6;      /* Main accent (purple) */
  --color-accent-light: #a78bfa; /* Light accent */
  --color-bg: #050505;           /* Background */
  /* ... more variables */
}
```

### Content

Edit `index.html` directly. Key areas:

- Hero text and badge
- Product descriptions and stats
- Feature cards
- About section principles
- Footer links

## Easter Egg

Try the Konami Code: Up, Up, Down, Down, Left, Right, Left, Right, B, A

## Deployment

The `dist/` folder after build is ready for static hosting:

- **Vercel**: Zero-config, just push
- **Netlify**: Drag & drop or connect repo
- **GitHub Pages**: Push to `gh-pages` branch
- **Cloudflare Pages**: Connect repo

## Note

This website folder is completely isolated from the main `branch-narrator` package:
- Not included in npm publish (`files` only includes `dist/`)
- Not included in TypeScript compilation (`include` only includes `src/**/*`)
- Has its own `package.json` for scripts

---

Built with care by Better Vibe.
