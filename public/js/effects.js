// public/js/effects.js - COMPLETE AND CORRECTED CODE
document.addEventListener("DOMContentLoaded", () => {

  // --- START: NAVBAR SCROLL EFFECT ---
  const header = document.getElementById("main-header");

  // මෙම function එක මගින් ඔබ පිටුව පහළට scroll කරන විට Navbar එකට glass effect එක එක් කරයි
  const handleScroll = () => {
    if (window.scrollY > 20) {
      // අපි CSS ගොනුවේ සෑදූ 'navbar-glass' class එක මෙහිදී එක් කරයි
      header.classList.add("scrolled", "navbar-glass");
    } else {
      header.classList.remove("scrolled", "navbar-glass");
    }
  };

  // Scroll event එකට සවන් දී ඉහත function එක ක්‍රියාත්මක කරයි
  window.addEventListener("scroll", handleScroll);
  // --- END: NAVBAR SCROLL EFFECT ---


  // --- START: EXISTING ANIMATION CODE ---
  // මෙය ඔබගේ ගොනුවේ දැනටමත් තිබූ කේතයයි
  const initAnimations = () => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    document.querySelectorAll(".reveal").forEach((el) => {
      observer.observe(el);
    });
    document.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
        card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
      });
    });
  };

  initAnimations();
  // --- END: EXISTING ANIMATION CODE ---
});