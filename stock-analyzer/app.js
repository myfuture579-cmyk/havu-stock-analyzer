// ============================
// STATE & VARIABLES
// ============================
let chart, candleSeries, sma20Series, sma50Series;
let currentStockData = []; // Lưu dữ liệu thô để gửi cho AI
const API_PROXY = 'https://api.allorigins.win/raw?url=';

// ============================
// DOM ELEMENTS
// ============================
const tickerInput = document.getElementById('ticker-input');
const btnLoadChart = document.getElementById('btn-load-chart');
const displayTicker = document.getElementById('display-ticker');
const chartContainer = document.getElementById('chart-container');
const chartLoading = document.getElementById('chart-loading');

const geminiApiKeyInput = document.getElementById('gemini-api-key');
const btnSaveApi = document.getElementById('btn-save-api');
const btnAnalyzeAi = document.getElementById('btn-analyze-ai');
const aiLoading = document.getElementById('ai-loading');
const aiResult = document.getElementById('ai-result');

// Load API Key từ localStorage nếu có
if (localStorage.getItem('stock_gemini_key')) {
    geminiApiKeyInput.value = localStorage.getItem('stock_gemini_key');
}

btnSaveApi.addEventListener('click', () => {
    const key = geminiApiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('stock_gemini_key', key);
        alert('Đã lưu API Key thành công!');
    }
});

// ============================
// TÍNH TOÁN SMA (Simple Moving Average)
// ============================
function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push({ time: data[i].time, value: NaN }); // Không đủ dữ liệu
            continue;
        }
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push({ time: data[i].time, value: sum / period });
    }
    return sma.filter(item => !isNaN(item.value));
}

// ============================
// KHỞI TẠO BIỂU ĐỒ (TRADINGVIEW)
// ============================
function initChart() {
    if (chart) {
        chart.remove();
    }
    
    chart = LightweightCharts.createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight,
        layout: {
            background: { type: 'solid', color: '#0b0e14' },
            textColor: '#d1d5db',
        },
        grid: {
            vertLines: { color: '#2a2e39' },
            horzLines: { color: '#2a2e39' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#2a2e39',
        },
        timeScale: {
            borderColor: '#2a2e39',
            timeVisible: true,
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#10b981',
        wickDownColor: '#ef4444',
        wickUpColor: '#10b981',
    });

    sma20Series = chart.addLineSeries({ color: '#2962FF', lineWidth: 2, title: 'SMA 20' });
    sma50Series = chart.addLineSeries({ color: '#FF6D00', lineWidth: 2, title: 'SMA 50' });

    // Cập nhật kích thước khi resize cửa sổ
    window.addEventListener('resize', () => {
        chart.resize(chartContainer.clientWidth, chartContainer.clientHeight);
    });
}

async function fetchStockData(ticker) {
    // Phương án cuối cùng và ổn định nhất: AllOrigins kết hợp Yahoo Finance
    // AllOrigins là máy chủ trung gian duy nhất KHÔNG CHẶN tên miền của Vercel.
    let queryTicker = ticker.toUpperCase().trim();
    if (!queryTicker.includes('.')) {
        queryTicker += '.VN';
    }

    const end = Math.floor(Date.now() / 1000);
    const start = end - (365 * 24 * 60 * 60); // 1 năm

    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${queryTicker}?period1=${start}&period2=${end}&interval=1d`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('Kết nối mạng yếu, vui lòng nhấn Tải Biểu Đồ lại lần nữa.');
    
    const proxyData = await response.json();
    const data = JSON.parse(proxyData.contents);
    
    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
        throw new Error(`Mã cổ phiếu "${ticker}" không tồn tại.`);
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];

    const chartData = [];
    for (let i = 0; i < timestamps.length; i++) {
        if (quotes.open[i] === null || quotes.high[i] === null || quotes.low[i] === null || quotes.close[i] === null) continue;
        
        const date = new Date(timestamps[i] * 1000);
        const dateString = date.toISOString().split('T')[0];
        
        chartData.push({
            time: dateString,
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: quotes.close[i],
            volume: quotes.volume[i]
        });
    }

    chartData.sort((a, b) => new Date(a.time) - new Date(b.time));
    return chartData;
}

// Xử lý nút Tải biểu đồ
btnLoadChart.addEventListener('click', async () => {
    const ticker = tickerInput.value.trim().toUpperCase();
    if (!ticker) return;

    displayTicker.innerText = ticker;
    chartLoading.style.display = 'flex';
    btnAnalyzeAi.disabled = true;

    try {
        if (!chart) initChart();
        
        currentStockData = await fetchStockData(ticker);
        
        // Đưa dữ liệu nến lên biểu đồ
        candleSeries.setData(currentStockData);

        // Tính và vẽ SMA
        const sma20 = calculateSMA(currentStockData, 20);
        const sma50 = calculateSMA(currentStockData, 50);
        
        sma20Series.setData(sma20);
        sma50Series.setData(sma50);

        // Zoom cho vừa màn hình
        chart.timeScale().fitContent();
        
        // Bật nút AI
        btnAnalyzeAi.disabled = false;
        
        // Cập nhật lại dữ liệu thô bao gồm cả SMA để chuẩn bị gửi cho AI
        currentStockData.forEach(candle => {
            const t = candle.time;
            const s20 = sma20.find(s => s.time === t);
            const s50 = sma50.find(s => s.time === t);
            candle.sma20 = s20 ? s20.value : null;
            candle.sma50 = s50 ? s50.value : null;
        });

    } catch (error) {
        alert('Lỗi: ' + error.message);
    } finally {
        chartLoading.style.display = 'none';
    }
});

// ============================
// AI ANALYSIS (GEMINI)
// ============================
btnAnalyzeAi.addEventListener('click', async () => {
    const apiKey = geminiApiKeyInput.value.trim() || localStorage.getItem('stock_gemini_key');
    if (!apiKey) {
        alert('Vui lòng nhập Gemini API Key để sử dụng tính năng này!');
        geminiApiKeyInput.focus();
        return;
    }

    if (currentStockData.length < 100) {
        alert('Dữ liệu không đủ để phân tích. Cần ít nhất 100 phiên.');
        return;
    }

    // Lấy 100 phiên gần nhất (khoảng 5 tháng) để gửi cho AI
    const recentData = currentStockData.slice(-100);
    const ticker = displayTicker.innerText;

    // Chuẩn bị chuỗi dữ liệu (chỉ lấy Close, SMA20, SMA50)
    let dataString = `Mã cổ phiếu: ${ticker}\nDữ liệu 100 phiên gần nhất (Ngày | Đóng cửa | SMA20 | SMA50):\n`;
    recentData.forEach(d => {
        dataString += `${d.time} | ${d.close.toFixed(2)} | ${d.sma20 ? d.sma20.toFixed(2) : '-'} | ${d.sma50 ? d.sma50.toFixed(2) : '-'}\n`;
    });

    const prompt = `Bạn là một Chuyên gia Phân tích Kỹ thuật Chứng khoán hàng đầu (Master Technical Analyst).
Phương pháp chuyên môn của bạn là: Lý thuyết Sóng Elliott (Elliott Wave Theory) và Chiến lược Giao cắt Trung bình động (Moving Average Crossover).

Dưới đây là dữ liệu giá đóng cửa và 2 đường SMA(20), SMA(50) của mã cổ phiếu ${ticker} trong 100 phiên gần nhất:

<data>
${dataString}
</data>

Nhiệm vụ của bạn: Dựa vào sự biến động giá và các chỉ báo trên, hãy phân tích xu hướng hiện tại và đưa ra nhận định chuyên sâu theo các bước sau. Trình bày bằng Tiếng Việt, định dạng Markdown rõ ràng, dễ đọc.

1. **Phân tích Cấu trúc Sóng (Elliott Wave):**
   - Đánh giá xem cổ phiếu đang nằm ở chu kỳ nào (Sóng Đẩy 1-2-3-4-5 hay Sóng Điều chỉnh A-B-C).
   - Hãy lý luận ngắn gọn dựa trên mức độ tăng/giảm giá của các chuỗi ngày. Nếu không rõ ràng, hãy đưa ra kịch bản khả dĩ nhất.

2. **Phân tích Động lượng (MA Crossover):**
   - Vị thế hiện tại của Giá so với SMA 20 và SMA 50.
   - Khoảng cách và sự giao cắt giữa SMA 20 và SMA 50 đang cho tín hiệu gì (Golden Cross, Death Cross, hay sideway)?

3. **Kết luận & Hành động (Actionable Advice):**
   - Xu hướng chính hiện tại là gì?
   - Đưa ra lời khuyên cho nhà đầu tư (Mua/Bán/Nắm giữ).
   - Gợi ý mức giá Cắt lỗ (Stop-loss) tham khảo dựa trên đáy gần nhất.

Lưu ý: Không dùng ngôn ngữ quá cảnh báo pháp lý rườm rà. Viết một cách tự tin, sắc sảo như một chuyên gia đang tư vấn cho quỹ đầu tư.`;

    aiResult.style.display = 'none';
    aiLoading.style.display = 'flex';
    btnAnalyzeAi.disabled = true;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2 // Giữ nhiệt độ thấp để AI phân tích logic, tránh bịa đặt
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Lỗi gọi API Gemini');
        }

        const data = await response.json();
        const textResult = data.candidates[0].content.parts[0].text;
        
        // Chuyển Markdown cơ bản sang HTML (chỉ xử lý in đậm, danh sách và tiêu đề)
        let htmlResult = textResult
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h3>$1</h3>')
            .replace(/^\d+\.\s+\*\*(.*?)\*\*/gim, '<h3>$1</h3>') // Xử lý các tiêu đề số như "1. **Phân tích Sóng**"
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\n/gim, '<br>');
        
        aiResult.innerHTML = htmlResult;

    } catch (error) {
        aiResult.innerHTML = `<p style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi: ${error.message}</p>`;
    } finally {
        aiLoading.style.display = 'none';
        aiResult.style.display = 'block';
        btnAnalyzeAi.disabled = false;
    }
});

// Khởi chạy khi trang load xong
document.addEventListener('DOMContentLoaded', () => {
    // Mặc định load AAPL
    setTimeout(() => {
        btnLoadChart.click();
    }, 500);
});
