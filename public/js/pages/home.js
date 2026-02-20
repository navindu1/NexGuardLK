// File: public/js/pages/home.js
import { apiFetch, appData } from '../api.js';

export function renderHomePage(renderFunc) {
    renderFunc(`
        <div class="page" id="page-home">
            <div class="text-center py-10 md:py-16 px-4 reveal">
                <h1 class="text-4xl md:text-5xl font-black text-white leading-tight" style="font-family: 'Orbitron', sans-serif;">
                    Experience <span class="gradient-text">True Internet Freedom</span>
                    <span class="block text-3xl md:text-4xl mt-2">in Sri Lanka.</span>
                </h1>
                <p class="max-w-3xl mx-auto mt-5 text-base md:text-lg text-gray-300">
                    Blazing fast, ultra-secure V2Ray connections designed for seamless streaming, gaming, and browsing. Unleash the full potential of your internet with NexGuard.
                </p>
                <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <a href="/plans" class="nav-link-internal ai-button rounded-lg">View Plans <i class="fa-solid fa-arrow-right ml-2"></i></a>
                    <a href="/about?scroll=contact-section" class="nav-link-internal ai-button secondary rounded-lg"><i class="fa-solid fa-headset mr-2"></i> Contact Us</a>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                <div class="card reveal custom-radius card-glass p-5 rounded-xl text-center"><i class="fa-solid fa-bolt text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">Unmatched Speed</h3><p class="text-gray-400 mt-2 text-sm">Optimized servers for Sri Lankan networks for the lowest latency and highest speeds.</p></div>
                <div class="card reveal custom-radius card-glass p-5 rounded-xl text-center"><i class="fa-solid fa-shield-halved text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">Rock-Solid Security</h3><p class="text-gray-400 mt-2 text-sm">Advanced V2Ray protocols to keep your online activities private and secure.</p></div>
                <div class="card reveal custom-radius card-glass p-5 rounded-xl text-center"><i class="fa-solid fa-headset text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">24/7 Support</h3><p class="text-gray-400 mt-2 text-sm">Dedicated support team available via WhatsApp and Telegram to assist you.</p></div>
            </div>
            <div class="mt-20 flex flex-col lg:flex-row items-center gap-8 lg:gap-12 reveal">
                <div class="lg:w-1/2 custom-radius">
                    <img src="/assets/image.jpg" alt="V2Ray on a laptop" class="custom-radius shadow-2xl shadow-blue-500/20 w-full h-auto object-cover">
                </div>
                <div class="w-full lg:w-1/2 text-center lg:text-left px-4">
                    <h2 class="text-2xl md:text-3xl font-bold text-white mb-4">How to Get Started?</h2>
                    <p class="text-gray-300 mb-6 text-sm md:text-base">Connecting is simple. Just follow these three easy steps to unlock true internet freedom.</p>
                    <div class="space-y-4">
                        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center font-bold text-blue-300">1</div>
                            <div>
                                <h3 class="font-semibold text-white text-left sm:text-left">Choose a Plan</h3>
                                <p class="text-gray-400 text-sm text-left sm:text-left">Select a data plan that fits your needs and pick your internet provider (ISP).</p>
                            </div>
                        </div>
                        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center font-bold text-blue-300">2</div>
                            <div>
                                <h3 class="font-semibold text-white text-left sm:text-left">Make the Payment</h3>
                                <p class="text-gray-400 text-sm text-left sm:text-left">Complete the payment via bank transfer and submit the receipt through our checkout page.</p>
                            </div>
                        </div>
                        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center font-bold text-blue-300">3</div>
                            <div>
                                <h3 class="font-semibold text-white text-left sm:text-left">Get Approved & Connect</h3>
                                <p class="text-gray-400 text-sm text-left sm:text-left">Your order will be approved by an admin. You'll receive the config link via WhatsApp to connect!</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="faq-section" class="mt-20 reveal">
                <header class="text-center mb-10">
                    <h2 class="text-2xl font-bold text-white">Frequently Asked Questions</h2>
                    <p class="text-gray-400 mt-2">Answers to common questions about our service.</p>
                </header>
                <div class="space-y-4 max-w-3xl mx-auto">
                    <details class="card-glass p-5 custom-radius cursor-pointer">
                        <summary class="font-semibold text-white flex justify-between items-center">
                            <span>What exactly is V2Ray?</span>
                            <i class="fa-solid fa-chevron-down transition-transform duration-300"></i>
                        </summary>
                        <p class="text-gray-300 text-sm mt-3 pt-3 border-t border-white/10">
                            V2Ray is a powerful and flexible networking tool used to secure your internet connection and bypass restrictions. It routes your internet traffic through an encrypted tunnel, protecting your data from being monitored and giving you access to the open internet.
                        </p>
                    </details>
                    <details class="card-glass p-5 custom-radius cursor-pointer">
                        <summary class="font-semibold text-white flex justify-between items-center">
                            <span>Which devices and apps are supported?</span>
                            <i class="fa-solid fa-chevron-down transition-transform duration-300"></i>
                        </summary>
                        <p class="text-gray-300 text-sm mt-3 pt-3 border-t border-white/10">
                            Our service works on a wide range of devices. For Android, we recommend using 'v2rayNG'. For iOS, 'FoXray' or 'Shadowrocket' are great options. For Windows, you can use 'v2rayN'. We provide guides to help you set up the connection easily.
                        </p>
                    </details>
                    <details class="card-glass p-5 custom-radius cursor-pointer">
                        <summary class="font-semibold text-white flex justify-between items-center">
                            <span>What is your refund policy?</span>
                            <i class="fa-solid fa-chevron-down transition-transform duration-300"></i>
                        </summary>
                        <p class="text-gray-300 text-sm mt-3 pt-3 border-t border-white/10">
                            You are eligible for a full refund if the request is made within <strong>48 hours</strong> of purchase and your total data usage is less than <strong>10 GB</strong>. If these conditions are not met, a refund will not be possible.
                        </p>
                    </details>
                    <details class="card-glass p-5 custom-radius cursor-pointer">
                        <summary class="font-semibold text-white flex justify-between items-center">
                            <span>How long does it take for an order to be approved?</span>
                            <i class="fa-solid fa-chevron-down transition-transform duration-300"></i>
                        </summary>
                        <p class="text-gray-300 text-sm mt-3 pt-3 border-t border-white/10">
                            Orders are typically reviewed and approved by an admin within a few hours. After you submit your payment receipt, we will verify it and send the connection details to you via WhatsApp as quickly as possible.
                        </p>
                    </details>
                </div>
            </div>
        </div>`);
}

export function renderAboutPage(renderFunc) {
    renderFunc(`
        <div id="page-about" class="page">
            <div class="flex flex-col lg:flex-row gap-8">
                <div class="flex-grow card-glass p-8 custom-radius space-y-5 reveal">
                    <h2 class="text-2xl font-bold">About NexGuard LK</h2>
                    <p class="text-gray-300 text-sm">NexGuard is dedicated to providing secure, fast, and reliable internet freedom in Sri Lanka. Our mission is to deliver top-tier V2Ray services that are both affordable and powerful.</p>
                    <div><h3 class="text-lg font-bold text-white mb-2"><i class="fa-solid fa-rocket text-blue-400 mr-2"></i> Our Mission</h3><p class="text-gray-300 text-sm">To democratize internet access by providing robust, uncensored, and private connectivity solutions to every Sri Lankan.</p></div>
                    <div><h3 class="text-lg font-bold text-white mb-2"><i class="fa-solid fa-server text-blue-400 mr-2"></i> Our Technology</h3><p class="text-gray-300 text-sm">We leverage cutting-edge V2Ray technology with advanced protocols like VLESS and VMess, coupled with optimized routing over Sri Lankan ISPs.</p></div>
                    <div class="pt-4 mt-4 border-t border-white/10">
                        <h3 class="text-lg font-bold text-white mb-3"><i class="fa-solid fa-star text-blue-400 mr-2"></i> Our Core Features</h3>
                        <div class="space-y-3 text-sm">
                            <p><i class="fa-solid fa-shield-virus text-green-400 w-5 text-center"></i> <strong>Strict No-Log Policy:</strong> Your privacy is paramount. We never track or store your online activity.</p>
                            <p><i class="fa-solid fa-mobile-screen-button text-green-400 w-5 text-center"></i> <strong>Multi-Device Support:</strong> Use your single account on your phone, laptop, and tablet simultaneously.</p>
                            <p><i class="fa-solid fa-bolt-lightning text-green-400 w-5 text-center"></i> <strong>Admin-Approved Setup:</strong> Your account is securely created and delivered after payment verification.</p>
                        </div>
                    </div>
                </div>
                <div class="lg:w-80 flex-shrink-0 reveal custom-radius">
                    <div class="card-glass p-6 custom-radius text-center sticky top-28 shadow-xl">
                        <img src="/assets/ceo.jpg" alt="Nexguard Founder" class="w-24 h-24 rounded-full mx-auto border-4 border-blue-500 shadow-md">
                        <h3 class="text-xl font-bold mt-4 text-white">Navindu R.</h3>
                        <p class="text-blue-400 text-sm font-medium">CEO & Founder</p>
                        <p class="text-xs text-gray-300 mt-3 leading-relaxed">A passionate advocate for digital privacy, I founded <span class="text-blue-400 font-semibold">NexGuard</span> to bring world-class, unrestricted connectivity to Sri Lanka.</p>
                        <div class="mt-4 text-sm text-gray-300 space-y-3 text-left">
                            <p class="flex items-center gap-2"><i class="fas fa-map-marker-alt text-blue-400"></i> Based in Eheliyagoda, Sri Lanka</p>
                            <p class="flex items-center gap-2"><i class="fas fa-shield-alt text-blue-400"></i> 2+ Years in Networking & Cybersecurity</p>
                            <p class="flex items-center gap-2"><i class="fas fa-bullseye text-blue-400"></i> Mission: Empowering Digital Freedom</p>
                        </div>
                        <div class="flex justify-center space-x-5 mt-6">
                            <a href="https://wa.me/94770492554" target="_blank" class="text-green-400 hover:text-green-500 transition transform hover:scale-110"><i class="fab fa-whatsapp fa-lg"></i></a>
                            <a href="https://www.facebook.com/nexguardlk" target="_blank" class="text-blue-400 hover:text-blue-500 transition transform hover:scale-110"><i class="fab fa-facebook fa-lg"></i></a>
                            <a href="https://t.me/nexguardusagebot" target="_blank" class="text-gray-400 hover:text-redgray-500 transition transform hover:scale-110"><i class="fab fa-telegram fa-lg"></i></a>
                        </div>
                    </div>
                </div>
            </div>
            <div id="contact-section" class="mt-20">
                <header class="text-center mb-10 reveal"><h2 class="text-2xl font-bold text-white">Get In Touch</h2></header>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                    <a href="https://chat.whatsapp.com/DoErFmB8KSW6XLmjmJPWar" target="_blank" class="card reveal card-glass p-5 custom-radius text-center flex flex-col items-center justify-center"><i class="fa-brands fa-whatsapp text-3xl text-green-400 mb-3"></i><h3 class="text-lg font-bold text-white">WhatsApp</h3><p class="text-gray-400 mt-1 text-xs">Tap to chat for quick support.</p></a>
                    <a href="https://t.me/nexguardusagebot" target="_blank" class="card reveal card-glass p-5 custom-radius text-center flex flex-col items-center justify-center"><i class="fa-brands fa-telegram text-3xl text-sky-400 mb-3"></i><h3 class="text-lg font-bold text-white">Telegram</h3><p class="text-gray-400 mt-1 text-xs">Join our channel or contact our bot.</p></a>
                    <a href="mailto:navindu4000@gmail.com" class="card reveal card-glass p-5 custom-radius text-center flex flex-col items-center justify-center"><i class="fa-solid fa-envelope-open-text text-3xl text-red-400 mb-3"></i><h3 class="text-lg font-bold text-white">Email</h3><p class="text-gray-400 mt-1 text-xs">Send us an email for detailed inquiries.</p></a>
                </div>
            </div>
        </div>`);
}

export function renderPrivacyPage(renderFunc) {
    // 1. පිටුවේ නව සැකැස්ම (Exact Modern Design match)
    renderFunc(`
        <div id="page-privacy" class="page space-y-8 animate-fade-in relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-900/10 to-transparent -z-10 pointer-events-none"></div>

            <div class="text-center py-10 md:py-14 px-4 reveal relative z-10">
                <h1 class="text-4xl md:text-5xl font-black text-white font-['Orbitron'] mb-4 drop-shadow-lg">Privacy & Policy</h1>
                <p class="text-gray-400 max-w-2xl mx-auto text-sm md:text-base font-medium">Your privacy is important to us. This policy outlines how we collect, use, and protect your information.</p>
            </div>

            <div class="max-w-4xl mx-auto px-4 reveal space-y-6 relative z-10">
                <div class="card-glass custom-radius p-6 md:p-8 bg-slate-800/40 border border-white/5 hover:border-blue-500/30 transition-all duration-300 shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1">
                    <h2 class="text-xl md:text-2xl font-bold text-white mb-5 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                            <i class="fa-solid fa-circle-info text-blue-400"></i>
                        </div>
                        Information We Collect
                    </h2>
                    <p class="text-gray-300 mb-5 text-sm leading-relaxed">We collect various types of information to provide and improve our services to you. This may include:</p>
                    <ul class="space-y-4">
                        <li class="flex items-start gap-3 text-sm text-gray-400">
                            <i class="fa-solid fa-check text-blue-500 mt-1"></i>
                            <span><strong class="text-gray-200">Personal Information:</strong> Such as your chosen username, WhatsApp number for support, and an encrypted password.</span>
                        </li>
                        <li class="flex items-start gap-3 text-sm text-gray-400">
                            <i class="fa-solid fa-check text-blue-500 mt-1"></i>
                            <span><strong class="text-gray-200">Usage Data:</strong> We do not track the websites you visit. We do not store logs of your online activity.</span>
                        </li>
                    </ul>
                </div>

                <div class="card-glass custom-radius p-6 md:p-8 bg-slate-800/40 border border-white/5 hover:border-blue-500/30 transition-all duration-300 shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1">
                    <h2 class="text-xl md:text-2xl font-bold text-white mb-5 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                            <i class="fa-solid fa-gear text-blue-400"></i>
                        </div>
                        How We Use Information
                    </h2>
                    <ul class="space-y-4">
                        <li class="flex items-start gap-3 text-sm text-gray-400">
                            <i class="fa-solid fa-arrow-right text-blue-500 mt-1"></i>
                            <span>To provide, operate, and maintain our V2Ray services.</span>
                        </li>
                        <li class="flex items-start gap-3 text-sm text-gray-400">
                            <i class="fa-solid fa-arrow-right text-blue-500 mt-1"></i>
                            <span>To process your transactions and manage your orders securely.</span>
                        </li>
                        <li class="flex items-start gap-3 text-sm text-gray-400">
                            <i class="fa-solid fa-arrow-right text-blue-500 mt-1"></i>
                            <span>To communicate with you via WhatsApp or Telegram for fast customer support.</span>
                        </li>
                        <li class="flex items-start gap-3 text-sm text-gray-400">
                            <i class="fa-solid fa-arrow-right text-blue-500 mt-1"></i>
                            <span>To find and prevent fraud to protect our network and users.</span>
                        </li>
                    </ul>
                </div>

                <div class="card-glass custom-radius p-6 md:p-8 bg-amber-900/10 border border-white/5 border-l-4 border-l-amber-500 hover:border-amber-500/30 transition-all duration-300 shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-2xl rounded-full pointer-events-none"></div>

                    <h2 class="text-xl md:text-2xl font-bold text-white mb-5 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                            <i class="fa-solid fa-money-bill-wave text-amber-400"></i>
                        </div>
                        Refund Policy
                    </h2>
                    <p class="text-gray-300 mb-6 text-sm leading-relaxed">We offer a conditional refund for our V2Ray packages. You are eligible for a full refund under the following conditions:</p>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div class="bg-black/40 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                <i class="fa-solid fa-clock text-amber-400 text-lg"></i>
                            </div>
                            <span class="text-sm text-gray-300">Request must be made within <strong class="text-white block mt-1 text-base">2 days (48 hours)</strong>.</span>
                        </div>
                        <div class="bg-black/40 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                <i class="fa-solid fa-chart-pie text-amber-400 text-lg"></i>
                            </div>
                            <span class="text-sm text-gray-300">Data usage must be less than <strong class="text-white block mt-1 text-base">10 GB</strong>.</span>
                        </div>
                    </div>

                    <div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
                        <i class="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5"></i>
                        <p class="font-semibold text-amber-400 text-xs md:text-sm uppercase tracking-wider">If these conditions are not met, you will not be eligible for a refund.</p>
                    </div>
                </div>
            </div>

            <div class="card-glass p-8 custom-radius max-w-4xl mx-auto reveal border border-white/5 mt-10 relative z-10">
                <div class="text-center mb-8">
                    <h2 class="text-3xl font-bold text-white font-['Orbitron'] mb-2">Downloadable Software</h2>
                    <p class="text-gray-400 text-sm">Get the recommended V2Ray client for your device.</p>
                </div>
                
                <div id="privacy-software-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="col-span-full text-center py-8 text-gray-500">
                        <i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i><br>Loading Downloads...
                    </div>
                </div>
            </div>
        </div>
    `);

    // 2. දත්ත ගෙන්වා ගැනීම සහ පෙන්වීම (Data Fetching Logic - Software Downloads)
    const loadLinks = async () => {
        try {
            const res = await apiFetch('/api/user/software-links');
            const data = await res.json();
            const container = document.getElementById('privacy-software-list');
            
            if (data.success && data.links && data.links.length > 0) {
                container.innerHTML = data.links.map(link => `
                    <a href="${link.url}" target="_blank" class="group relative flex flex-col items-center p-6 bg-slate-800/40 hover:bg-slate-700/40 border border-white/5 hover:border-blue-500/30 rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-blue-500/10 cursor-pointer overflow-hidden">
                        
                        <div class="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 transition-all duration-500"></div>

                        <div class="relative w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 border border-white/5 group-hover:border-blue-500/30">
                            <i class="${link.icon || 'fa-solid fa-download'} text-3xl text-blue-400 group-hover:text-white transition-colors duration-300 drop-shadow-md"></i>
                        </div>

                        <h3 class="relative font-bold text-white text-lg mb-1 group-hover:text-blue-300 transition-colors">${link.name}</h3>
                        <p class="relative text-xs text-gray-400 mb-5">Latest Version</p>

                        <div class="relative w-full">
                            <button class="w-full py-2.5 px-4 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 hover:border-blue-500 rounded-full transition-all duration-300 flex items-center justify-center gap-2 font-medium text-sm shadow-lg group-hover:shadow-blue-500/25">
                                <span>Download</span>
                                <i class="fa-solid fa-cloud-arrow-down group-hover:animate-bounce"></i>
                            </button>
                        </div>
                    </a>
                `).join('');
            } else {
                container.innerHTML = `
                    <div class="col-span-full text-center p-8 border-2 border-dashed border-slate-700 rounded-3xl bg-slate-800/30">
                        <i class="fa-solid fa-box-open text-4xl text-slate-600 mb-3"></i>
                        <p class="text-gray-400 text-sm">No downloadable software available at the moment.</p>
                    </div>`;
            }
        } catch (e) {
            console.error("Failed to load links", e);
            const container = document.getElementById('privacy-software-list');
            if(container) container.innerHTML = '<div class="col-span-full text-center text-red-400 bg-red-900/10 p-4 rounded-2xl border border-red-500/20">Failed to load download links. Please check your connection.</div>';
        }
    };

    // Load links automatically
    loadLinks();
}