// public/js/effects.js - NEW 3D Background with Three.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
        canvas: document.querySelector('#bg-canvas'),
        alpha: true // Make canvas transparent
    });

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.setZ(30);

    // 2. Particle Geometry
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 5000;

    const posArray = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * (Math.random() * 50);
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    // 3. Particle Material
    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.05,
        color: 0xa855f7, // Use brand purple
        transparent: true,
        blending: THREE.AdditiveBlending
    });

    // 4. Create Particle Mesh
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    // 5. Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;
    document.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
    });

    // 6. Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
        requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();

        // Animate particles
        particlesMesh.rotation.y = -0.1 * elapsedTime;

        // Make particles respond to mouse movement
        if (mouseX > 0) {
            particlesMesh.rotation.x = -mouseY * (elapsedTime * 0.00008);
            particlesMesh.rotation.y = -mouseX * (elapsedTime * 0.00008);
        }

        renderer.render(scene, camera);
    };

    animate();

    // 7. Handle Window Resize
    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });

    // 8. GSAP Animations (using Intersection Observer is now handled in main.js)
    // This is a more robust way to handle animations on dynamically loaded content.
    gsap.registerPlugin(ScrollTrigger);

    function animateOnScroll() {
        gsap.utils.toArray('.reveal').forEach(elem => {
            gsap.fromTo(elem, {
                opacity: 0,
                y: 50,
                scale: 0.95
            }, {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: 0.8,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: elem,
                    start: 'top 85%',
                    end: 'bottom 20%',
                    toggleActions: 'play none none none'
                }
            });
        });
    }

    // Initial animation call
    animateOnScroll();

    // Re-run animations when the router updates the content
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                animateOnScroll();
            }
        });
    });

    const mainContentArea = document.getElementById("app-router");
    if (mainContentArea) {
        observer.observe(mainContentArea, {
            childList: true
        });
    }
});