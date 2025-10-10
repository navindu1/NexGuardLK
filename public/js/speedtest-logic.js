document.addEventListener('DOMContentLoaded', () => {
    // This function runs when the DOM is ready, but it doesn't do anything
    // until the speed test page is loaded and the button is clicked.

    // We use a global function to initialize the test,
    // which will be called from the router in main.js
    // This is a simple way to handle script loading for this specific page.
});

// We attach the main logic to the window object so our router can find it
window.initSpeedTest = () => {
    const startBtn = document.getElementById('start-speedtest-btn');
    if (!startBtn) {
        // If the button isn't on the page, do nothing.
        return;
    }

    const pingVal = document.getElementById('ping-value');
    const jitterVal = document.getElementById('jitter-value');
    const downloadVal = document.getElementById('download-value');
    const uploadVal = document.getElementById('upload-value');
    const statusDiv = document.getElementById('test-status');

    let gauge;

    // Initialize Gauge
    if (typeof RadialGauge !== 'undefined') {
        gauge = new RadialGauge({
            renderTo: 'speed-gauge',
            width: 250,
            height: 250,
            units: "Mbps",
            minValue: 0,
            maxValue: 100,
            majorTicks: ["0", "10", "20", "30", "40", "50", "60", "70", "80", "90", "100"],
            minorTicks: 2,
            strokeTicks: true,
            highlights: [
                { "from": 0, "to": 20, "color": "rgba(99, 102, 241, .75)" },
                { "from": 20, "to": 50, "color": "rgba(168, 85, 247, .75)" },
                { "from": 50, "to": 100, "color": "rgba(236, 72, 153, .75)" }
            ],
            colorPlate: "transparent",
            colorMajorTicks: "#e0e0e0",
            colorMinorTicks: "#d1d5db",
            colorTitle: "#e0e0e0",
            colorUnits: "#9ca3af",
            colorNumbers: "#e0e0e0",
            colorNeedle: "rgba(244, 114, 182, 1)",
            colorNeedleEnd: "rgba(236, 72, 153, 1)",
            valueBox: true,
            animationRule: "elastic",
            animationDuration: 500,
            animatedValue: true
        }).draw();
    } else {
        console.error("canvas-gauges library not loaded.");
    }

    const resetUI = () => {
        pingVal.textContent = '- ms';
        jitterVal.textContent = '- ms';
        downloadVal.textContent = '- Mbps';
        uploadVal.textContent = '- Mbps';
        statusDiv.textContent = '';
        if(gauge) gauge.value = 0;
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-play mr-2"></i> START TEST';
    };

    const testPing = async () => {
        statusDiv.textContent = 'Testing Ping & Jitter...';
        const PING_COUNT = 5;
        let pings = [];
        for (let i = 0; i < PING_COUNT; i++) {
            const startTime = Date.now();
            await fetch(`/api/ping?t=${startTime}`); // Cache buster
            pings.push(Date.now() - startTime);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        const avgPing = pings.reduce((a, b) => a + b, 0) / PING_COUNT;
        let jitter = 0;
        for (let i = 0; i < pings.length - 1; i++) {
            jitter += Math.abs(pings[i+1] - pings[i]);
        }
        jitter = jitter / (pings.length - 1);

        pingVal.textContent = `${avgPing.toFixed(0)} ms`;
        jitterVal.textContent = `${jitter.toFixed(1)} ms`;
    };

    const testDownload = async () => {
        statusDiv.textContent = 'Testing Download Speed...';
        const FILE_URL = '/speedtest-files/dummy-10mb.bin';
        const FILE_SIZE_MB = 10;

        const startTime = Date.now();
        let loaded = 0;

        const response = await fetch(`${FILE_URL}?t=${startTime}`); // Cache buster
        const reader = response.body.getReader();

        const read = async () => {
            const { done, value } = await reader.read();
            if (done) {
                return;
            }
            loaded += value.length;
            const duration = (Date.now() - startTime) / 1000;
            const speedBps = loaded / duration;
            const speedMbps = (speedBps * 8) / (1024 * 1024);
            if (gauge) gauge.value = speedMbps;
            downloadVal.textContent = `${speedMbps.toFixed(2)} Mbps`;
            await read();
        };
        await read();

        const finalDuration = (Date.now() - startTime) / 1000;
        const finalSpeedBps = (FILE_SIZE_MB * 1024 * 1024) / finalDuration;
        const finalSpeedMbps = (finalSpeedBps * 8) / (1024 * 1024);
        downloadVal.textContent = `${finalSpeedMbps.toFixed(2)} Mbps`;
    };

    const testUpload = async () => {
        statusDiv.textContent = 'Testing Upload Speed...';
        const UPLOAD_SIZE_MB = 5;
        const CHUNK_SIZE = 1024 * 256; // 256KB chunks
        const TOTAL_CHUNKS = (UPLOAD_SIZE_MB * 1024 * 1024) / CHUNK_SIZE;
        const data = new Blob([new ArrayBuffer(CHUNK_SIZE)], { type: 'application/octet-stream' });

        const startTime = Date.now();
        let chunksSent = 0;

        const sendChunk = async () => {
            if (chunksSent >= TOTAL_CHUNKS) return;

            await fetch('/api/upload', { method: 'POST', body: data });
            chunksSent++;

            const duration = (Date.now() - startTime) / 1000;
            const uploadedBytes = chunksSent * CHUNK_SIZE;
            const speedBps = uploadedBytes / duration;
            const speedMbps = (speedBps * 8) / (1024 * 1024);
            if(gauge) gauge.value = speedMbps;
            uploadVal.textContent = `${speedMbps.toFixed(2)} Mbps`;
            await sendChunk();
        };

        await sendChunk();

        const finalDuration = (Date.now() - startTime) / 1000;
        const finalSpeedBps = (UPLOAD_SIZE_MB * 1024 * 1024) / finalDuration;
        const finalSpeedMbps = (finalSpeedBps * 8) / (1024 * 1024);
        uploadVal.textContent = `${finalSpeedMbps.toFixed(2)} Mbps`;
    };

    startBtn.onclick = async () => {
        resetUI();
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> RUNNING...';

        try {
            await testPing();
            await testDownload();
            if(gauge) gauge.value = 0; // Reset gauge for upload
            await testUpload();
            statusDiv.textContent = 'Test Completed!';
        } catch (error) {
            console.error("Speed test failed:", error);
            statusDiv.textContent = `Error: ${error.message}`;
        } finally {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fa-solid fa-redo mr-2"></i> TEST AGAIN';
            if(gauge) gauge.value = 0;
        }
    };
};

// This is a bit of a hack to make sure the script runs when the page is rendered
// A better SPA would handle script loading/unloading per route
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            if (document.getElementById('start-speedtest-btn')) {
                window.initSpeedTest();
                // Once initialized on the page, we don't need to observe anymore
                observer.disconnect();
                return;
            }
        }
    }
});

const appRouter = document.getElementById('app-router');
if (appRouter) {
    observer.observe(appRouter, { childList: true, subtree: true });
}