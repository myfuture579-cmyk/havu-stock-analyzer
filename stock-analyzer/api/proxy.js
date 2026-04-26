export default async function handler(req, res) {
    const { ticker } = req.query;
    if (!ticker) {
        return res.status(400).json({ error: 'Thiếu mã cổ phiếu' });
    }
    
    // Xóa đuôi .VN nếu có để dùng cho VNDIRECT
    const queryTicker = ticker.toUpperCase().replace('.VN', '').trim();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 1); // Lấy 1 năm

    const endStr = endDate.toISOString().split('T')[0];
    const startStr = startDate.toISOString().split('T')[0];

    // Lấy dữ liệu thẳng từ VNDIRECT (Máy chủ backend không bị lỗi CORS)
    const targetUrl = `https://finfo-api.vndirect.com.vn/v4/stock_prices?sort=date&q=code:${queryTicker}~date:gte:${startStr}~date:lte:${endStr}&size=1000`;

    try {
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (!response.ok) {
            return res.status(500).json({ error: 'VNDIRECT từ chối kết nối' });
        }

        const json = await response.json();
        const dataList = json.data;

        if (!dataList || dataList.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy mã cổ phiếu' });
        }

        // Giả lập lại cấu trúc dữ liệu của Yahoo Finance để Frontend (app.js) không cần phải sửa đổi gì thêm
        const timestamps = [];
        const open = [];
        const high = [];
        const low = [];
        const close = [];
        const volume = [];

        for (let i = 0; i < dataList.length; i++) {
            const item = dataList[i];
            const unixTime = Math.floor(new Date(item.date).getTime() / 1000);
            
            timestamps.push(unixTime);
            open.push(item.adOpen);
            high.push(item.adHigh);
            low.push(item.adLow);
            close.push(item.adClose);
            volume.push(item.nmVolume);
        }

        const yahooFormatData = {
            chart: {
                result: [{
                    timestamp: timestamps,
                    indicators: {
                        quote: [{ open, high, low, close, volume }]
                    }
                }]
            }
        };
        
        // Cấp quyền CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(yahooFormatData);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
}
