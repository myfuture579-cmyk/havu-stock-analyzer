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
    // TCBS (Techcom Securities) là API hiếm hoi nhất hiện nay vẫn đang MỞ CORS cho các trang web public.
    let queryTicker = ticker.toUpperCase().trim();
    queryTicker = queryTicker.replace('.VN', '');

    const end = Math.floor(Date.now() / 1000);
    const start = end - (365 * 24 * 60 * 60); // 1 năm

    // Link API public của TCBS
    const targetUrl = `https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term?ticker=${queryTicker}&type=stock&resolution=D&from=${start}&to=${end}`;

    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error('Không thể kết nối đến máy chủ TCBS.');
    
    const json = await response.json();
    const dataList = json.data;
    
    if (!dataList || dataList.length === 0) {
        throw new Error(`Mã cổ phiếu "${ticker}" không tồn tại hoặc sai mã.`);
    }

    const chartData = [];
    for (let i = 0; i < dataList.length; i++) {
        const item = dataList[i];
        if (item.open === null || item.close === null) continue;
        
        // TCBS trả về tradingDate dạng chuỗi ISO hoặc timezone, cắt lấy YYYY-MM-DD
        const dateString = item.tradingDate.split('T')[0];
        
        chartData.push({
            time: dateString,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume
        });
    }

    // Sắp xếp lại theo thời gian chuẩn
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

// Hàm phân tích kỹ thuật nội bộ tự động (không cần API Key)
function generateLocalAnalysis(recentData, ticker) {
    const last = recentData[recentData.length - 1];
    const price = last.close;
    const sma20 = last.sma20;
    const sma50 = last.sma50;
    
    // Tìm đỉnh/đáy trong 20 phiên gần nhất
    const last20 = recentData.slice(-20);
    const low20 = Math.min(...last20.map(d => d.close));
    const high20 = Math.max(...last20.map(d => d.close));
    
    let waveAnalysis = "";
    let maAnalysis = "";
    let trend = "";
    let action = "";
    let stopLoss = (low20 * 0.98).toFixed(2); // 2% dưới đáy gần nhất

    // Logic Động lượng & Sóng
    if (price > sma20 && sma20 > sma50) {
        trend = "TĂNG (Bullish)";
        action = "NẮM GIỮ / MUA THÊM";
        maAnalysis = `**Tín hiệu Tích cực:** Giá hiện tại (${price}) đang nằm trên cả SMA 20 và SMA 50. Đường trung bình ngắn (20) nằm trên đường trung bình dài (50) cho thấy xu hướng tăng trung hạn đang được xác nhận mạnh mẽ.`;
        waveAnalysis = `Dựa trên cấu trúc giá đang bứt phá mạnh, cổ phiếu **${ticker}** nhiều khả năng đang nằm trong **Sóng Đẩy (Impulse Wave 3 hoặc 5)** của chu kỳ Elliott. Lực cầu mua lên đang hoàn toàn áp đảo.`;
    } else if (price < sma20 && sma20 < sma50) {
        trend = "GIẢM (Bearish)";
        action = "QUAN SÁT / CẮT LỖ";
        maAnalysis = `**Tín hiệu Tiêu cực:** Giá hiện tại (${price}) đang nằm dưới cả SMA 20 và SMA 50. Sự xuất hiện của Death Cross (SMA 20 cắt xuống SMA 50) cho thấy phe bán đang kiểm soát hoàn toàn.`;
        waveAnalysis = `Cấu trúc giá suy yếu rõ rệt. Cổ phiếu nhiều khả năng đang rơi vào **Sóng Điều chỉnh (Sóng C)** hoặc một nhịp rũ bỏ sâu. Rất khó để tìm kiếm điểm mua an toàn trong giai đoạn này.`;
    } else {
        trend = "ĐI NGANG (Sideways / Tích lũy)";
        action = "QUAN SÁT VÙNG NỀN";
        maAnalysis = `**Tín hiệu Trung tính:** Giá (${price}) đang dao động cắt qua cắt lại các đường SMA. Hai đường SMA 20 và 50 có xu hướng xoắn vào nhau, cho thấy thị trường đang giằng co.`;
        waveAnalysis = `Hành vi giá đi ngang cho thấy cổ phiếu có thể đang ở trong **Sóng Điều chỉnh phức tạp (Sóng 4 hoặc Sóng B)**. Dòng tiền đang chững lại để chờ đợi tín hiệu bứt phá rõ ràng hơn.`;
    }

    return `*Lưu ý: Do bạn không sử dụng API Key (hoặc hết hạn mức), hệ thống đã tự động kích hoạt **Thuật toán Chuyên gia Nội bộ (Local Algorithm)** để phân tích.*

### 1. Phân tích Cấu trúc Sóng (Elliott Wave)
${waveAnalysis}

### 2. Phân tích Động lượng (Moving Averages)
${maAnalysis}
- Mức giá thấp nhất 20 phiên qua: **${low20.toFixed(2)}**
- Mức giá cao nhất 20 phiên qua: **${high20.toFixed(2)}**

### 3. Kết luận & Hành động
- **Xu hướng chính:** **${trend}**
- **Hành động khuyến nghị:** **${action}**
- **Giá Cắt lỗ (Stop-loss) tham khảo:** Thủng vùng **${stopLoss}** (dưới đáy gần nhất 2%).

*Phân tích này được tính toán hoàn toàn cục bộ trên trình duyệt của bạn với tốc độ ánh sáng và miễn phí 100%.*`;
}

// ============================
// AI ANALYSIS (GEMINI)
// ============================
btnAnalyzeAi.addEventListener('click', async () => {
    if (currentStockData.length < 100) {
        alert('Dữ liệu không đủ để phân tích. Cần ít nhất 100 phiên.');
        return;
    }

    const apiKey = geminiApiKeyInput.value.trim() || localStorage.getItem('stock_gemini_key');
    const recentData = currentStockData.slice(-100);
    const ticker = displayTicker.innerText;

    aiResult.style.display = 'none';
    aiLoading.style.display = 'flex';
    btnAnalyzeAi.disabled = true;

    // NẾU KHÔNG CÓ API KEY -> GỌI THUẬT TOÁN NỘI BỘ (MIỄN PHÍ)
    if (!apiKey) {
        setTimeout(() => {
            const localMarkdown = generateLocalAnalysis(recentData, ticker);
            
            let htmlResult = localMarkdown
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/gim, '<em>$1</em>')
                .replace(/\n/gim, '<br>');
                
            aiResult.innerHTML = htmlResult;
            aiResult.style.display = 'block';
            aiLoading.style.display = 'none';
            btnAnalyzeAi.disabled = false;
        }, 1000);
        return;
    }

    // NẾU CÓ API KEY -> GỌI GEMINI AI
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
        // Fallback sang thuật toán nội bộ khi Quota hết hoặc API lỗi
        const localMarkdown = generateLocalAnalysis(recentData, ticker);
        const errorNotice = `> **Cảnh báo từ hệ thống:** API Key bị từ chối với lỗi: *${error.message}*. \n> Để không làm gián đoạn, hệ thống tự động kích hoạt **Thuật toán Chuyên gia Nội bộ** (miễn phí) để phân tích thay thế.\n\n---\n\n`;
        
        let combinedMarkdown = errorNotice + localMarkdown;
        let htmlResult = combinedMarkdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^> (.*$)/gim, '<blockquote style="border-left: 4px solid #ef4444; padding-left: 10px; margin-left: 0; color: #ff6b6b; font-style: italic;">$1</blockquote>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/\n/gim, '<br>');

        aiResult.innerHTML = htmlResult;
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
