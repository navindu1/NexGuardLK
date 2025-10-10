// public/js/hero-3d.js

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Swiper from 'swiper/bundle';

document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger);

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
        canvas: document.querySelector('#hero-3d-canvas'),
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.z = 5;

    // --- 3D Objects for Slides ---
    const objects = [];
    const material = new THREE.MeshStandardMaterial({ color: 0x9333EA, roughness: 0.3, metalness: 0.7 });

    // Slide 1: Shield
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2), material);
    objects.push(shield);

    // Slide 2: Network (simplified)
    const network = new THREE.Group();
    for (let i = 0; i < 5; i++) {
        const node = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), material);
        node.position.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
        network.add(node);
    }
    objects.push(network);
    
    // Add more objects for other slides here...

    objects.forEach(obj => scene.add(obj));

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // --- Swiper Slideshow ---
    const heroSlider = new Swiper('.hero-slider', {
        effect: 'fade',
        speed: 1000,
        autoplay: { delay: 5000 },
        pagination: { el: '.swiper-pagination', clickable: true },
        on: {
            slideChange: function() {
                animateHero3DObject(this.activeIndex);
            }
        }
    });

    function animateHero3DObject(index) {
        objects.forEach((obj, i) => {
            gsap.to(obj.scale, { x: i === index ? 1 : 0, y: i === index ? 1 : 0, z: i === index ? 1 : 0, duration: 1, ease: 'power3.inOut' });
        });
    }
    animateHero3DObject(0); // Initial animation

    // --- Scroll Parallax ---
    gsap.to(camera.position, {
        z: 2,
        scrollTrigger: {
            trigger: ".hero-slider",
            start: "top top",
            end: "bottom top",
            scrub: 1.5,
        }
    });

    // --- Mouse Parallax ---
    document.addEventListener('mousemove', (e) => {
        const mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        const mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
        gsap.to(scene.rotation, {
            y: mouseX * 0.2,
            x: mouseY * 0.2,
            duration: 0.5,
            ease: 'power2.out'
        });
    });

    // --- Animation Loop ---
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    // --- Navbar Scroll Effect ---
    const header = document.getElementById('main-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
});