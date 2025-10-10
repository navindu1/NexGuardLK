document.addEventListener('DOMContentLoaded', () => {
    // This is a placeholder; main logic is in initSpeedTest
});

window.initSpeedTest = () => {
    const startBtn = document.getElementById('start-speedtest-btn');
    if (!startBtn) return;

    const pingValEl = document.getElementById('ping-value');
    const jitterValEl = document.getElementById('jitter-value');
    const downloadValEl = document.getElementById('download-value');
    const uploadValEl = document.getElementById('upload-value');
    const statusDiv = document.getElementById('test-status');
    const speedValueEl = document.getElementById('speed-value');
    const speedUnitTextEl = document.getElementById('speed-unit-text');
    const speedIconEl = document.getElementById('speed-icon');

    let gauge;

    if (typeof RadialGauge !== 'undefined') {
        gauge = new RadialGauge({
            renderTo: 'speed-gauge',
            width: 300,
            height: 300,
            units: "Mbps",
            minValue: 0,
            maxValue: 100,
            startAngle: 150,
            ticksAngle: 160,
            valueBox: false, // We use a custom overlay
            majorTicks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
            minorTicks: 5,
            strokeTicks: true,
            highlights: [
                { "from": 0, "to": 100, "color": "rgba(0, 0, 0, 0.2)" }
            ],
            colorPlate: "transparent",
            borderShadowWidth: 0,
            borders: false,
            needleType: "arrow",
            needleWidth: 3,
            needleCircleSize: 10,
            needleCircleOuter: true,
            needleCircleInner: false,
            animationDuration: 500,
            animationRule: "linear",
            colorNeedle: "#a78bfa",
            colorNeedleEnd: "#ec4899",
            colorMajorTicks: "#4b5563",
            colorMinorTicks: "#374151",
            colorNumbers: "#9ca3af",
            colorUnits: "#9ca3af",
            fontNumbersSize: 18,
            fontUnitsSize: 22,
            barWidth: 15,
            barProgress: true,
            barStrokeWidth: 0,
            colorBarProgress: "#a78bfa",
        }).draw();
    }

    const resetUI = () => {
        pingValEl.textContent = '- ms';
        jitterValEl.textContent = '- ms';
        downloadValEl.textContent = '- Mbps';
        uploadValEl.textContent = '- Mbps';
        speedValueEl.textContent = '-';
        statusDiv.textContent = '';
        if (gauge) gauge.value = 0;
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-play mr-2"></i> START';
        speedUnitTextEl.textContent = 'DOWNLOAD';
        speedIconEl.className = 'fa-solid fa-down-long';
    };

    const testPing = async () => {
        statusDiv.textContent = 'Testing Ping & Jitter...';
        const PING_COUNT = 5;
        let pings = [];
        for (let i = 0; i < PING_COUNT; i++) {
            const startTime = Date.now();
            await fetch(`/api/ping?t=${startTime}`);
            pings.push(Date.now() - startTime);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        const avgPing = pings.reduce((a, b) => a + b, 0) / PING_COUNT;
        let jitter = 0;
        for (let i = 0; i < pings.length - 1; i++) {
            jitter += Math.abs(pings[i+1] - pings[i]);
        }
        jitter = jitter / (pings.length - 1);

        pingValEl.textContent = `${avgPing.toFixed(0)} ms`;
        jitterValEl.textContent = `${jitter.toFixed(1)} ms`;
    };
    
    const testSpeed = async (type) => {
        const isDownload = type === 'download';
        statusDiv.textContent = `Testing ${isDownload ? 'Download' : 'Upload'} Speed...`;
        speedUnitTextEl.textContent = isDownload ? 'DOWNLOAD' : 'UPLOAD';
        speedIconEl.className = isDownload ? 'fa-solid fa-down-long' : 'fa-solid fa-up-long';

        const FILE_SIZE_MB = isDownload ? 10 : 5;
        const startTime = Date.now();
        let loaded = 0;

        if (isDownload) {
            const response = await fetch(`/speedtest-files/dummy-10mb.bin?t=${startTime}`);
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                loaded += value.length;
                updateSpeed(loaded, startTime);
            }
        } else { // Upload
            const CHUNK_SIZE = 256 * 1024;
            const TOTAL_CHUNKS = (FILE_SIZE_MB * 1024 * 1024) / CHUNK_SIZE;
            const data = new Blob([new ArrayBuffer(CHUNK_SIZE)], { type: 'application/octet-stream' });
            for (let i = 0; i < TOTAL_CHUNKS; i++) {
                await fetch('/api/upload', { method: 'POST', body: data });
                loaded += CHUNK_SIZE;
                updateSpeed(loaded, startTime);
            }
        }

        const finalDuration = (Date.now() - startTime) / 1000;
        const finalSpeedMbps = ((FILE_SIZE_MB * 1024 * 1024 * 8) / finalDuration) / (1024 * 1024);
        (isDownload ? downloadValEl : uploadValEl).textContent = `${finalSpeedMbps.toFixed(2)} Mbps`;
    };
    
    const updateSpeed = (bytes, startTime) => {
        const duration = (Date.now() - startTime) / 1000;
        if (duration === 0) return;
        const speedBps = bytes / duration;
        const speedMbps = (speedBps * 8) / (1024 * 1024);
        if (gauge) gauge.value = speedMbps;
        speedValueEl.textContent = speedMbps.toFixed(2);
    };

    startBtn.onclick = async () => {
        resetUI();
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> RUNNING...';
        
        try {
            await testPing();
            await testSpeed('download');
            if (gauge) gauge.value = 0;
            speedValueEl.textContent = '-';
            await testSpeed('upload');
            statusDiv.textContent = 'Test Completed!';
        } catch (error) {
            console.error("Speed test failed:", error);
            statusDiv.textContent = `Error: ${error.message}`;
        } finally {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fa-solid fa-redo mr-2"></i> TEST AGAIN';
            if (gauge) gauge.value = 0;
            speedValueEl.textContent = '-';
        }
    };
};

const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            if (document.getElementById('start-speedtest-btn')) {
                window.initSpeedTest();
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