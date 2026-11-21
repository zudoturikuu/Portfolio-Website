// Pixel background: thousands of tiny square "pixels" that form slowly rotating 3D shapes
// and fly apart into the next shape every few seconds (inspired by nusx.edu.sg).
//
// It sits in a fixed <canvas> behind the whole page. How visible it is comes from the
// --pixels-visible CSS variable, which the hero script sets: 0 while the banner photo is
// on screen, rising to 1 as the photo collapses into the "wongjunheng.com" title.
//
// This is a regular script, not type="module": browsers block local module files when
// index.html is opened straight from the computer (a file:// address). Everything is wrapped
// in one function so its names can't clash with the page's other script, and three.js is
// fetched from the CDN with import() instead.

(async () => {
    const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";
    let THREE;
    try {
        THREE = await import(THREE_URL);
    } catch (error) {
        return;   // offline, or the CDN is down: the page simply has no background animation
    }

    const canvas = document.querySelector(".pixel-background");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const smallScreen = window.matchMedia("(max-width: 600px)").matches;

    const COUNT = smallScreen ? 5000 : 9000;   // fewer pixels on phones, to save battery
    const HOLD_SECONDS = 6;                    // how long each shape stays before changing
    const MORPH_SECONDS = 2.6;                 // how long the pixels take to fly to the next shape
    const PIXEL_COLOR = new THREE.Color("#BDDDFC");
    const PIXEL_OPACITY = 0.55;                // kept low so the page text stays easy to read

    // ---------- Shapes: each returns COUNT points as [x, y, z, x, y, z, ...] ----------

    function sphere() {
        // "Fibonacci sphere": spreads points evenly over a ball
        const points = new Float32Array(COUNT * 3);
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < COUNT; i++) {
            const y = 1 - (i / (COUNT - 1)) * 2;
            const ring = Math.sqrt(1 - y * y);
            const angle = i * goldenAngle;
            points.set([Math.cos(angle) * ring * 1.9, y * 1.9, Math.sin(angle) * ring * 1.9], i * 3);
        }
        return points;
    }

    function doubleHelix() {
        // Two twisting strands joined by "rungs", like DNA
        const points = new Float32Array(COUNT * 3);
        const strandPoints = Math.floor(COUNT * 0.7);
        for (let i = 0; i < COUNT; i++) {
            let x, y, z;
            if (i < strandPoints) {
                const t = (i / strandPoints) * 2 - 1;                // -1 to 1 along the helix
                const angle = t * Math.PI * 3 + (i % 2) * Math.PI;   // alternate between the two strands
                const wobble = 0.08 * (Math.random() - 0.5);
                x = Math.cos(angle) * (0.85 + wobble);
                z = Math.sin(angle) * (0.85 + wobble);
                y = t * 2.4;
            } else {
                const rung = Math.floor(Math.random() * 28);
                const t = (rung / 27) * 2 - 1;
                const angle = t * Math.PI * 3;
                const across = Math.random() * 2 - 1;                // position along the rung
                x = Math.cos(angle) * 0.85 * across;
                z = Math.sin(angle) * 0.85 * across;
                y = t * 2.4;
            }
            points.set([x, y, z], i * 3);
        }
        return points;
    }

    function torus() {
        // A doughnut / tunnel shape
        const points = new Float32Array(COUNT * 3);
        const big = 1.45;
        const small = 0.6;
        const around = 120;
        for (let i = 0; i < COUNT; i++) {
            const u = ((i % around) / around) * Math.PI * 2;
            const v = (Math.floor(i / around) / (COUNT / around)) * Math.PI * 2;
            points.set([
                (big + small * Math.cos(u)) * Math.cos(v),
                small * Math.sin(u),
                (big + small * Math.cos(u)) * Math.sin(v),
            ], i * 3);
        }
        return points;
    }

    function vortex() {
        // A flat, swirling disc with an empty centre, like a galaxy or black hole
        const points = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
            const radius = 0.55 + Math.pow(Math.random(), 0.7) * 1.9;
            const arm = (i % 4) * (Math.PI / 2);
            const angle = arm + radius * 2.2 + (Math.random() - 0.5) * 0.6;
            const thickness = 0.12 * (Math.random() - 0.5) / radius;
            points.set([Math.cos(angle) * radius, thickness, Math.sin(angle) * radius], i * 3);
        }
        return points;
    }

    // ---------- Drawing the pixels ----------

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch (error) {
        return;   // no WebGL on this device: the page simply has no background animation
    }
    // Draw at 1 canvas pixel per CSS pixel (up to 4x fewer pixels to fill than full Retina
    // resolution). The CSS scales it up with image-rendering: pixelated, so every dot stays a
    // crisp square, which suits the pixel look and keeps the animation light on phones.
    renderer.setPixelRatio(1);
    const dotSize = window.devicePixelRatio >= 1.5 ? 1 : 2;   // about 2x2 screen pixels on any display

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    const shapes = reduceMotion ? [sphere()] : [sphere(), doubleHelix(), vortex(), torus()];
    const positions = new Float32Array(shapes[0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Each pixel starts its flight at a slightly different moment, and drifts a little
    // off course mid-flight, so shape changes look like a swarm rather than a slide.
    const delays = new Float32Array(COUNT);
    const drift = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
        delays[i] = Math.random() * 0.35;
        drift.set([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], i * 3);
    }

    // Square pixels, brighter when nearer the camera and fainter further away
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uColor: { value: PIXEL_COLOR },
            uOpacity: { value: PIXEL_OPACITY },
            uSize: { value: dotSize },
        },
        vertexShader: `
            uniform float uSize;
            varying float vNearness;
            void main() {
                vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * viewPosition;
                gl_PointSize = uSize;
                vNearness = smoothstep(9.5, 4.5, -viewPosition.z);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            varying float vNearness;
            void main() {
                gl_FragColor = vec4(uColor, uOpacity * (0.25 + 0.75 * vNearness));
            }
        `,
    });

    const pixels = new THREE.Points(geometry, material);
    pixels.rotation.x = 0.35;
    scene.add(pixels);

    function resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // Move the camera back on narrow screens so the whole shape still fits
        camera.position.z = 2.6 / (Math.tan(THREE.MathUtils.degToRad(22.5)) * Math.min(camera.aspect, 1));
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
    }
    window.addEventListener("resize", resize);
    resize();

    if (reduceMotion) return;   // a still sphere only: no rotation or morphing

    // Desktop: the shape leans slightly towards the mouse
    const lean = { x: 0, y: 0 };
    window.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "mouse") return;
        lean.x = (event.clientY / window.innerHeight - 0.5) * 0.3;
        lean.y = (event.clientX / window.innerWidth - 0.5) * 0.3;
    });

    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const root = document.documentElement;
    const clock = new THREE.Clock();
    let shapeIndex = 0;
    let timeInShape = 0;
    let spin = 0;

    function frame() {
        requestAnimationFrame(frame);
        const seconds = Math.min(clock.getDelta(), 0.1);

        // Skip all the work while the background is invisible (e.g. on the banner photo)
        const visible = parseFloat(root.style.getPropertyValue("--pixels-visible")) || 0;
        if (visible <= 0) return;

        // Slow spin, plus a little extra turn as you scroll the page
        spin += seconds * 0.12;
        pixels.rotation.y = spin + window.scrollY * 0.0004 + lean.y;
        pixels.rotation.x += (0.35 + lean.x - pixels.rotation.x) * 0.05;

        // Hold the current shape, then fly every pixel to its place in the next shape
        timeInShape += seconds;
        if (timeInShape > HOLD_SECONDS) {
            const from = shapes[shapeIndex];
            const to = shapes[(shapeIndex + 1) % shapes.length];
            const progress = Math.min((timeInShape - HOLD_SECONDS) / MORPH_SECONDS, 1);

            for (let i = 0; i < COUNT; i++) {
                const local = easeInOut(Math.min(Math.max((progress - delays[i]) / 0.65, 0), 1));
                const swell = Math.sin(local * Math.PI) * 0.6;   // drift off course mid-flight
                for (let axis = 0; axis < 3; axis++) {
                    const k = i * 3 + axis;
                    positions[k] = from[k] + (to[k] - from[k]) * local + drift[k] * swell;
                }
            }
            geometry.attributes.position.needsUpdate = true;

            if (progress >= 1) {
                shapeIndex = (shapeIndex + 1) % shapes.length;
                timeInShape = 0;
            }
        }

        renderer.render(scene, camera);
    }
    frame();
})();
