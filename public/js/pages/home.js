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
                <div class="card reveal card-glass p-5 rounded-xl text-center"><i class="fa-solid fa-bolt text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">Unmatched Speed</h3><p class="text-gray-400 mt-2 text-sm">Optimized servers for Sri Lankan networks for the lowest latency and highest speeds.</p></div>
                <div class="card reveal card-glass p-5 rounded-xl text-center"><i class="fa-solid fa-shield-halved text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">Rock-Solid Security</h3><p class="text-gray-400 mt-2 text-sm">Advanced V2Ray protocols to keep your online activities private and secure.</p></div>
                <div class="card reveal card-glass p-5 rounded-xl text-center"><i class="fa-solid fa-headset text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">24/7 Support</h3><p class="text-gray-400 mt-2 text-sm">Dedicated support team available via WhatsApp and Telegram to assist you.</p></div>
            </div>
            <div class="mt-20 flex flex-col lg:flex-row items-center gap-8 lg:gap-12 reveal">
                <div class="lg:w-1/2">
                    <img src="/assets/image.jpg" alt="V2Ray on a laptop" class="rounded-xl shadow-2xl shadow-blue-500/20 w-full h-auto object-cover">
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
                <div class="flex-grow card-glass p-8 rounded-lg space-y-5 reveal">
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
                <div class="lg:w-80 flex-shrink-0 reveal">
                    <div class="card-glass p-6 rounded-2xl text-center sticky top-28 shadow-xl">
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
                    <a href="https://chat.whatsapp.com/DoErFmB8KSW6XLmjmJPWar" target="_blank" class="card reveal card-glass p-5 rounded-xl text-center flex flex-col items-center justify-center"><i class="fa-brands fa-whatsapp text-3xl text-green-400 mb-3"></i><h3 class="text-lg font-bold text-white">WhatsApp</h3><p class="text-gray-400 mt-1 text-xs">Tap to chat for quick support.</p></a>
                    <a href="https://t.me/nexguardusagebot" target="_blank" class="card reveal card-glass p-5 rounded-xl text-center flex flex-col items-center justify-center"><i class="fa-brands fa-telegram text-3xl text-sky-400 mb-3"></i><h3 class="text-lg font-bold text-white">Telegram</h3><p class="text-gray-400 mt-1 text-xs">Join our channel or contact our bot.</p></a>
                    <a href="mailto:navindu4000@gmail.com" class="card reveal card-glass p-5 rounded-xl text-center flex flex-col items-center justify-center"><i class="fa-solid fa-envelope-open-text text-3xl text-red-400 mb-3"></i><h3 class="text-lg font-bold text-white">Email</h3><p class="text-gray-400 mt-1 text-xs">Send us an email for detailed inquiries.</p></a>
                </div>
            </div>
        </div>`);
}

export function renderPrivacyPage(renderFunc) {
    renderFunc(`
        <div id="page-privacy" class="page">
            <div class="card-glass p-8 rounded-lg space-y-5 max-w-4xl mx-auto reveal">
                <h2 class="text-2xl font-bold">Privacy & Refund Policy</h2>
                <div>
                    <h3 class="text-lg font-bold text-white mb-2">Our Commitment to Privacy</h3>
                    <p class="text-gray-300 text-sm">Your privacy is critically important to us. We do not store logs of your online activity. We store account information only for service provision. We aim for full transparency on how we handle your data.</p>
                </div>
                <div>
                    <h3 class="text-lg font-bold text-white mb-2">Information We Collect</h3>
                    <p class="text-gray-300 text-sm">We collect the bare minimum information to create and manage your account: your chosen username, WhatsApp number for support, and an encrypted password. We do not track the websites you visit.</p>
                </div>
                <div class="pt-4 border-t border-white/10">
                    <h3 class="text-xl font-bold">Refund Policy</h3>
                    <p class="text-gray-300 mt-2 text-sm">We offer a conditional refund for our V2Ray packages. You are eligible for a full refund under the following conditions:</p>
                    <ul class="list-disc list-inside text-gray-300 space-y-2 pl-4 mt-2 text-sm">
                        <li>The request must be made within <strong>2 days (48 hours)</strong> of the purchase.</li>
                        <li>Your total data usage must be less than <strong>10 GB</strong>.</li>
                    </ul>
                    <p class="font-semibold text-amber-400 mt-2 text-sm">If these conditions are not met, you will not be eligible for a refund.</p>
                </div>
            </div>
        </div>`);
}