const express = require("express")
const axios = require("axios")
const crypto = require("crypto")
const app = express()
app.use(express.json())

// 3commas API配置
const API_KEY = 'c8725ffe6f054b37b91927e57ce3eaf633223664a95a4ce59a3fb3b08d0c5f44';
const API_SECRET = 'a65440cf0330e6abf00392c59300a8efdc10fa136c6564436523615d5cf68672b93b2dd3dc0f5fba938b0cf7c12aa3ef18d4104b649c3265c9a5c5a4e7849e9d352687eddc52ce5207b79aae6d9206d72c46d7e76ddb94444de11f13a100827894e50c14';
const BASE_URL = 'https://api.3commas.io/public/api';

// 计算ATR
function calculateATR(candles, period = 14) {
    let trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
        const high = parseFloat(candles[i][2]);
        const low = parseFloat(candles[i][3]);
        const previousClose = parseFloat(candles[i - 1][4]);
        const trueRange = Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
        trueRanges.push(trueRange);
    }
    return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// 计算LTMS
function calculateLTMS(candles, shortPeriod = 10, longPeriod = 50) {
    const shortMA = candles.slice(-shortPeriod).reduce((sum, candle) => sum + parseFloat(candle[4]), 0) / shortPeriod;
    const longMA = candles.slice(-longPeriod).reduce((sum, candle) => sum + parseFloat(candle[4]), 0) / longPeriod;
    return { shortMA, longMA };
}

// 获取K线数据
async function getCandles(pair, interval = '5m', limit = 100) {
    const response = await axios.get(`${BASE_URL}/ver1/market/kline`, {
        params: { pair, interval, limit },
        headers: { 'APIKEY': API_KEY }
    });
    return response.data;
}

// 更新止盈止损
async function updateTakeProfitStopLoss(botId, takeProfit, stopLoss) {
    const response = await axios.post(`${BASE_URL}/ver1/bots/${botId}/update`, {
        take_profit: takeProfit,
        stop_loss: stopLoss
    }, {
        headers: { 'APIKEY': API_KEY, 'Signature': generateSignature() }
    });
    return response.data;
}

// 生成签名
function generateSignature() {
    const timestamp = Date.now();
    const signature = crypto.createHmac('sha256', API_SECRET)
        .update(`${API_KEY}${timestamp}`)
        .digest('hex');
    return signature;
}

// 策略逻辑
app.post('/strategy', async (req, res) => {
    const { botId, pair } = req.body;

    try {
        const candles = await getCandles(pair);
        const atr = calculateATR(candles);
        const { shortMA, longMA } = calculateLTMS(candles);

        // 双向LTMS策略
        if (shortMA > longMA) {
            // 多头信号
            const takeProfit = parseFloat(candles[candles.length - 1][4]) + atr;
            const stopLoss = parseFloat(candles[candles.length - 1][4]) - atr;
            await updateTakeProfitStopLoss(botId, takeProfit, stopLoss);
        } else if (shortMA < longMA) {
            // 空头信号
            const takeProfit = parseFloat(candles[candles.length - 1][4]) - atr;
            const stopLoss = parseFloat(candles[candles.length - 1][4]) + atr;
            await updateTakeProfitStopLoss(botId, takeProfit, stopLoss);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// 启动服务器
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
