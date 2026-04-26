export default async function handler(req, res) {
    const { ticker } = req.query;
    if (!ticker) {
        return res.status(400).json({ error: 'Thiếu mã cổ phiếu' });
    }
    
    // Tự động thêm đuôi .VN cho Yahoo Finance
    let queryTicker = ticker.toUpperCase();
    if (!queryTicker.includes('.')) {
        queryTicker += '.VN';
    }

    const end = Math.floor(Date.now() / 1000);
    const start = end - (365 * 24 * 60 * 60); // 1 năm

    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${queryTicker}?period1=${start}&period2=${end}&interval=1d`;

    try {
        const response = await fetch(targetUrl);
        const data = await response.json();
        
        // Cấp quyền CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi lấy dữ liệu từ Yahoo Finance' });
    }
}
