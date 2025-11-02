// Configuration
const CONFIG = {
    API_BASE: 'https://coincheck.com/api',
    // CORSプロキシを使用（本番環境では独自プロキシを推奨）
    CORS_PROXY: 'https://api.allorigins.win/raw?url=',
    REFRESH_INTERVAL: 5000, // 5秒 (デイトレード向け)
    CHART_POINTS: 100,
    ORDERBOOK_DEPTH: 5,
    USE_CORS_PROXY: true, // CORSエラー対策
    DEMO_MODE: false // デモモード（APIエラー時に自動的にON）
};

// State
let currentPair = 'btc_jpy';
let currentTimeframe = '5m';
let priceHistory = [];
let candleData = [];
let lastPrice = null;
let chart = null;
let priceAlerts = [];
let updateInterval = null;

// DOM Elements
const elements = {
    cryptoBtns: document.querySelectorAll('.crypto-btn'),
    timeframeBtns: document.querySelectorAll('.timeframe-btn'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    currentPrice: document.getElementById('currentPrice'),
    priceChange: document.getElementById('priceChange'),
    updateTime: document.getElementById('updateTime'),
    high24h: document.getElementById('high24h'),
    low24h: document.getElementById('low24h'),
    volume24h: document.getElementById('volume24h'),
    rsiValue: document.getElementById('rsiValue'),
    rsiStatus: document.getElementById('rsiStatus'),
    bbValue: document.getElementById('bbValue'),
    bbStatus: document.getElementById('bbStatus'),
    sma5Value: document.getElementById('sma5Value'),
    sma5Status: document.getElementById('sma5Status'),
    sma20Value: document.getElementById('sma20Value'),
    sma20Status: document.getElementById('sma20Status'),
    signalBadge: document.getElementById('signalBadge'),
    signalStrength: document.getElementById('signalStrength'),
    signalDescription: document.getElementById('signalDescription'),
    orderbook: document.getElementById('orderbook'),
    alertPrice: document.getElementById('alertPrice'),
    addAlertBtn: document.getElementById('addAlertBtn'),
    alertList: document.getElementById('alertList'),
    entryPrice: document.getElementById('entryPrice'),
    quantity: document.getElementById('quantity'),
    pnlCurrentPrice: document.getElementById('pnlCurrentPrice'),
    pnlAmount: document.getElementById('pnlAmount'),
    pnlPercent: document.getElementById('pnlPercent'),
    refreshBtn: document.getElementById('refreshBtn'),
    historyBtn: document.getElementById('historyBtn')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupEventListeners();
    loadSettings();
    initChart();
    startDataFetching();
}

function setupEventListeners() {
    // Crypto selector
    elements.cryptoBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            elements.cryptoBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPair = btn.dataset.pair;
            priceHistory = [];
            candleData = [];
            fetchData();
        });
    });

    // Timeframe selector
    elements.timeframeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            elements.timeframeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = btn.dataset.timeframe;
            updateChartTimeframe();
        });
    });

    // Alert management
    elements.addAlertBtn.addEventListener('click', addPriceAlert);
    elements.alertPrice.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addPriceAlert();
    });

    // P&L Calculator
    elements.entryPrice.addEventListener('input', calculatePnL);
    elements.quantity.addEventListener('input', calculatePnL);

    // Refresh button
    elements.refreshBtn.addEventListener('click', () => {
        fetchData();
        fetchOrderBook();
    });

    // History button
    elements.historyBtn.addEventListener('click', showHistory);
}

function startDataFetching() {
    fetchData();
    fetchOrderBook();
    
    // Clear existing interval if any
    if (updateInterval) clearInterval(updateInterval);
    
    // Start periodic updates
    updateInterval = setInterval(() => {
        fetchData();
        fetchOrderBook();
    }, CONFIG.REFRESH_INTERVAL);
}

async function fetchData() {
    try {
        updateStatus('connecting');
        
        const ticker = await fetchTicker(currentPair);
        
        if (ticker && ticker.last) {
            const price = parseFloat(ticker.last);
            const timestamp = Date.now();
            
            // Add to history
            priceHistory.push({ price, timestamp });
            
            // Keep only recent data
            if (priceHistory.length > CONFIG.CHART_POINTS) {
                priceHistory = priceHistory.slice(-CONFIG.CHART_POINTS);
            }
            
            // Update displays
            updatePriceDisplay(ticker);
            updateChart();
            
            // Calculate indicators
            if (priceHistory.length >= 20) {
                calculateAndDisplayIndicators();
                calculateSignal();
            }
            
            // Check alerts
            checkPriceAlerts(price);
            
            // Update P&L
            calculatePnL();
            
            updateStatus('connected');
            lastPrice = price;
        }
    } catch (error) {
        console.error('Fetch error:', error);
        updateStatus('disconnected');
    }
}

async function fetchTicker(pair) {
    try {
        let url = `${CONFIG.API_BASE}/ticker?pair=${pair}`;
        
        // CORSプロキシを使用
        if (CONFIG.USE_CORS_PROXY) {
            url = `${CONFIG.CORS_PROXY}${encodeURIComponent(url)}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        
        // データ検証
        if (!data || !data.last) {
            throw new Error('Invalid data received');
        }
        
        return data;
    } catch (error) {
        console.error('Fetch error:', error);
        
        // デモモードに切り替え
        if (!CONFIG.DEMO_MODE) {
            console.warn('Switching to DEMO MODE due to API error');
            CONFIG.DEMO_MODE = true;
            showDemoModeWarning();
        }
        
        // デモデータを返す
        return generateDemoData(pair);
    }
}

// デモデータ生成
function generateDemoData(pair) {
    const basePrice = {
        'btc_jpy': 8500000,
        'eth_jpy': 450000,
        'xrp_jpy': 95,
        'ltc_jpy': 12000
    };
    
    const base = basePrice[pair] || 1000000;
    const variation = base * 0.02; // ±2%の変動
    const price = base + (Math.random() - 0.5) * variation;
    
    return {
        last: price.toString(),
        bid: (price * 0.999).toString(),
        ask: (price * 1.001).toString(),
        high: (price * 1.05).toString(),
        low: (price * 0.95).toString(),
        volume: (Math.random() * 1000).toFixed(4),
        timestamp: Date.now()
    };
}

// デモモード警告を表示
function showDemoModeWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 600;
        max-width: 90%;
        text-align: center;
    `;
    warning.innerHTML = `
        ⚠️ デモモード<br>
        <span style="font-size: 14px; font-weight: normal;">
        APIエラーのため、デモデータを表示しています
        </span>
    `;
    document.body.appendChild(warning);
    
    // 5秒後に削除
    setTimeout(() => {
        warning.style.transition = 'opacity 0.5s';
        warning.style.opacity = '0';
        setTimeout(() => warning.remove(), 500);
    }, 5000);
}

async function fetchOrderBook() {
    try {
        let url = `${CONFIG.API_BASE}/order_books?pair=${currentPair}`;
        
        // CORSプロキシを使用
        if (CONFIG.USE_CORS_PROXY) {
            url = `${CONFIG.CORS_PROXY}${encodeURIComponent(url)}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Order book request failed');
        const data = await response.json();
        
        displayOrderBook(data);
    } catch (error) {
        console.error('Order book error:', error);
        
        // デモ板情報を表示
        if (CONFIG.DEMO_MODE) {
            displayOrderBook(generateDemoOrderBook());
        } else {
            displayOrderBookError();
        }
    }
}

// デモ板情報生成
function generateDemoOrderBook() {
    const basePrice = lastPrice || 8500000;
    const asks = [];
    const bids = [];
    
    // 売り板（現在価格より高い）
    for (let i = 0; i < 10; i++) {
        const price = basePrice * (1 + (i + 1) * 0.001);
        const amount = Math.random() * 0.5 + 0.1;
        asks.push([price.toString(), amount.toString()]);
    }
    
    // 買い板（現在価格より低い）
    for (let i = 0; i < 10; i++) {
        const price = basePrice * (1 - (i + 1) * 0.001);
        const amount = Math.random() * 0.5 + 0.1;
        bids.push([price.toString(), amount.toString()]);
    }
    
    return { asks, bids };
}

// 板情報エラー表示
function displayOrderBookError() {
    elements.orderbook.innerHTML = `
        <div class="orderbook-row">
            <div>価格</div>
            <div>数量</div>
            <div>累積</div>
        </div>
        <div style="text-align: center; padding: 20px; color: #ef4444;">
            板情報の取得に失敗しました
        </div>
    `;
}

function updateStatus(status) {
    const statusMap = {
        connecting: { dot: 'offline', text: '接続中...' },
        connected: { dot: '', text: CONFIG.DEMO_MODE ? 'デモモード（リアルタイム更新中）' : 'リアルタイム更新中' },
        disconnected: { dot: 'offline', text: '接続エラー' }
    };
    
    const s = statusMap[status];
    elements.statusDot.className = `status-dot ${s.dot}`;
    elements.statusText.textContent = s.text;
}

function updatePriceDisplay(ticker) {
    const price = parseFloat(ticker.last);
    
    // Current price
    elements.currentPrice.textContent = formatPrice(price, currentPair);
    
    // Price change
    if (lastPrice !== null) {
        const change = price - lastPrice;
        const changePercent = ((change / lastPrice) * 100).toFixed(2);
        const changeClass = change >= 0 ? 'positive' : 'negative';
        const changeSymbol = change >= 0 ? '▲' : '▼';
        
        elements.priceChange.className = `price-change ${changeClass}`;
        elements.priceChange.innerHTML = `
            <span>${changeSymbol} ${Math.abs(changePercent)}%</span>
            <span style="font-size: 14px;">(¥${Math.abs(change).toLocaleString('ja-JP', { maximumFractionDigits: 0 })})</span>
        `;
    }
    
    // 24h stats
    elements.high24h.textContent = formatPrice(parseFloat(ticker.high), currentPair);
    elements.low24h.textContent = formatPrice(parseFloat(ticker.low), currentPair);
    elements.volume24h.textContent = parseFloat(ticker.volume).toFixed(2);
    
    // Update time
    const now = new Date();
    elements.updateTime.textContent = `最終更新: ${now.toLocaleTimeString('ja-JP')}`;
}

function formatPrice(price, pair) {
    if (pair.includes('btc') || pair.includes('eth')) {
        return `¥${price.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
    } else {
        return `¥${price.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

function initChart() {
    const ctx = document.getElementById('priceChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '価格',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f1f5f9',
                    bodyColor: '#f1f5f9',
                    borderColor: '#334155',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return '¥' + context.parsed.y.toLocaleString('ja-JP');
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        color: '#334155',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        maxTicksLimit: 6
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: '#334155',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(value) {
                            return '¥' + value.toLocaleString('ja-JP');
                        }
                    }
                }
            }
        }
    });
}

function updateChart() {
    if (!chart || priceHistory.length === 0) return;
    
    const labels = priceHistory.map(h => {
        const date = new Date(h.timestamp);
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    });
    
    const data = priceHistory.map(h => h.price);
    
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('none');
}

function updateChartTimeframe() {
    // In a real implementation, this would fetch different timeframe data
    // For now, we just update the display
    fetchData();
}

function calculateAndDisplayIndicators() {
    const prices = priceHistory.map(h => h.price);
    
    // RSI
    const rsi = calculateRSI(prices, 14);
    elements.rsiValue.textContent = rsi.toFixed(2);
    
    if (rsi < 30) {
        elements.rsiStatus.textContent = '売られすぎ';
        elements.rsiStatus.className = 'indicator-status buy';
    } else if (rsi > 70) {
        elements.rsiStatus.textContent = '買われすぎ';
        elements.rsiStatus.className = 'indicator-status sell';
    } else {
        elements.rsiStatus.textContent = '中立';
        elements.rsiStatus.className = 'indicator-status neutral';
    }
    
    // Bollinger Bands
    const bb = calculateBollingerBands(prices, 20, 2);
    const currentPrice = prices[prices.length - 1];
    const bbPosition = ((currentPrice - bb.lower) / (bb.upper - bb.lower) * 100).toFixed(0);
    
    elements.bbValue.textContent = `${bbPosition}%`;
    
    if (currentPrice < bb.lower) {
        elements.bbStatus.textContent = '下限突破';
        elements.bbStatus.className = 'indicator-status buy';
    } else if (currentPrice > bb.upper) {
        elements.bbStatus.textContent = '上限突破';
        elements.bbStatus.className = 'indicator-status sell';
    } else {
        elements.bbStatus.textContent = 'レンジ内';
        elements.bbStatus.className = 'indicator-status neutral';
    }
    
    // Moving Averages
    const sma5 = calculateSMA(prices, 5);
    const sma20 = calculateSMA(prices, 20);
    
    elements.sma5Value.textContent = formatPrice(sma5, currentPair);
    elements.sma20Value.textContent = formatPrice(sma20, currentPair);
    
    if (sma5 > sma20) {
        elements.sma5Status.textContent = '上昇トレンド';
        elements.sma5Status.className = 'indicator-status buy';
        elements.sma20Status.textContent = '上昇トレンド';
        elements.sma20Status.className = 'indicator-status buy';
    } else {
        elements.sma5Status.textContent = '下降トレンド';
        elements.sma5Status.className = 'indicator-status sell';
        elements.sma20Status.textContent = '下降トレンド';
        elements.sma20Status.className = 'indicator-status sell';
    }
}

function calculateSignal() {
    const prices = priceHistory.map(h => h.price);
    const currentPrice = prices[prices.length - 1];
    
    let score = 0;
    let reasons = [];
    
    // RSI Analysis
    const rsi = calculateRSI(prices, 14);
    if (rsi < 30) {
        score += 2;
        reasons.push('RSIが売られすぎ水準');
    } else if (rsi > 70) {
        score -= 2;
        reasons.push('RSIが買われすぎ水準');
    }
    
    // Bollinger Bands
    const bb = calculateBollingerBands(prices, 20, 2);
    if (currentPrice < bb.lower) {
        score += 2;
        reasons.push('価格がボリンジャー下限突破');
    } else if (currentPrice > bb.upper) {
        score -= 2;
        reasons.push('価格がボリンジャー上限突破');
    }
    
    // Moving Average Crossover
    const sma5 = calculateSMA(prices, 5);
    const sma20 = calculateSMA(prices, 20);
    if (sma5 > sma20) {
        score += 1;
        reasons.push('短期移動平均が上昇トレンド');
    } else {
        score -= 1;
        reasons.push('短期移動平均が下降トレンド');
    }
    
    // Determine signal
    let signal = 'hold';
    if (score >= 2) signal = 'buy';
    else if (score <= -2) signal = 'sell';
    
    displaySignal(signal, Math.abs(score), reasons);
}

function displaySignal(signal, strength, reasons) {
    // Update badge
    const signalText = {
        buy: '🟢 買いシグナル',
        sell: '🔴 売りシグナル',
        hold: '🔵 様子見'
    };
    
    elements.signalBadge.textContent = signalText[signal];
    elements.signalBadge.className = `signal-badge ${signal}`;
    
    // Update strength bars
    const bars = elements.signalStrength.querySelectorAll('.strength-bar');
    bars.forEach((bar, i) => {
        if (i < strength) {
            bar.classList.add('active');
        } else {
            bar.classList.remove('active');
        }
    });
    
    // Update description
    const recommendations = {
        buy: 'エントリーを検討するタイミングです。少額から始めて、損切りラインを設定しましょう。',
        sell: '利益確定または損切りを検討するタイミングです。ポジションサイズに注意しましょう。',
        hold: '明確なシグナルがありません。様子見をおすすめします。'
    };
    
    let description = `<strong>${recommendations[signal]}</strong><br><br>`;
    description += reasons.map(r => `• ${r}`).join('<br>');
    
    elements.signalDescription.innerHTML = description;
}

function displayOrderBook(data) {
    if (!data || !data.asks || !data.bids) return;
    
    const asks = data.asks.slice(0, CONFIG.ORDERBOOK_DEPTH).reverse();
    const bids = data.bids.slice(0, CONFIG.ORDERBOOK_DEPTH);
    
    let html = `
        <div class="orderbook-row">
            <div>価格</div>
            <div>数量</div>
            <div>累積</div>
        </div>
    `;
    
    // Asks (売り注文)
    let cumulativeAsk = 0;
    asks.forEach(ask => {
        const price = parseFloat(ask[0]);
        const amount = parseFloat(ask[1]);
        cumulativeAsk += amount;
        
        html += `
            <div class="orderbook-row sell-order">
                <div>¥${price.toLocaleString('ja-JP')}</div>
                <div>${amount.toFixed(4)}</div>
                <div>${cumulativeAsk.toFixed(4)}</div>
            </div>
        `;
    });
    
    // Separator
    html += `<div style="height: 2px; background: #475569; margin: 4px 0;"></div>`;
    
    // Bids (買い注文)
    let cumulativeBid = 0;
    bids.forEach(bid => {
        const price = parseFloat(bid[0]);
        const amount = parseFloat(bid[1]);
        cumulativeBid += amount;
        
        html += `
            <div class="orderbook-row buy-order">
                <div>¥${price.toLocaleString('ja-JP')}</div>
                <div>${amount.toFixed(4)}</div>
                <div>${cumulativeBid.toFixed(4)}</div>
            </div>
        `;
    });
    
    elements.orderbook.innerHTML = html;
}

function addPriceAlert() {
    const price = parseFloat(elements.alertPrice.value);
    
    if (!price || price <= 0) {
        alert('有効な価格を入力してください');
        return;
    }
    
    const alert = {
        id: Date.now(),
        price: price,
        pair: currentPair,
        triggered: false
    };
    
    priceAlerts.push(alert);
    elements.alertPrice.value = '';
    updateAlertList();
    savePriceAlerts();
}

function updateAlertList() {
    if (priceAlerts.length === 0) {
        elements.alertList.innerHTML = `
            <div style="text-align: center; padding: 12px; color: #64748b; font-size: 13px;">
                アラートはまだ設定されていません
            </div>
        `;
        return;
    }
    
    let html = '';
    priceAlerts.forEach(alert => {
        html += `
            <div class="alert-item">
                <span>${getCryptoName(alert.pair)}: ¥${alert.price.toLocaleString('ja-JP')}</span>
                <button onclick="removeAlert(${alert.id})">削除</button>
            </div>
        `;
    });
    
    elements.alertList.innerHTML = html;
}

function removeAlert(id) {
    priceAlerts = priceAlerts.filter(a => a.id !== id);
    updateAlertList();
    savePriceAlerts();
}

function checkPriceAlerts(currentPrice) {
    priceAlerts.forEach(alert => {
        if (!alert.triggered && alert.pair === currentPair) {
            const diff = Math.abs(currentPrice - alert.price);
            const threshold = alert.price * 0.001; // 0.1%
            
            if (diff <= threshold) {
                alert.triggered = true;
                showNotification(`価格アラート: ${getCryptoName(alert.pair)}が¥${alert.price.toLocaleString()}に到達しました`);
            }
        }
    });
}

function calculatePnL() {
    const entry = parseFloat(elements.entryPrice.value);
    const qty = parseFloat(elements.quantity.value);
    
    if (!entry || !qty || !lastPrice) {
        elements.pnlCurrentPrice.textContent = '---';
        elements.pnlAmount.textContent = '---';
        elements.pnlPercent.textContent = '---';
        return;
    }
    
    const current = lastPrice;
    const pnl = (current - entry) * qty;
    const pnlPercent = ((current - entry) / entry) * 100;
    
    elements.pnlCurrentPrice.textContent = formatPrice(current, currentPair);
    
    const pnlClass = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const pnlSymbol = pnl >= 0 ? '+' : '';
    
    elements.pnlAmount.textContent = `${pnlSymbol}¥${pnl.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
    elements.pnlAmount.className = `pnl-value ${pnlClass}`;
    
    elements.pnlPercent.textContent = `${pnlSymbol}${pnlPercent.toFixed(2)}%`;
    elements.pnlPercent.className = `pnl-value ${pnlClass}`;
}

// Technical Indicator Functions
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateSMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
    const sma = calculateSMA(prices, period);
    const slice = prices.slice(-period);
    
    const variance = slice.reduce((sum, price) => {
        return sum + Math.pow(price - sma, 2);
    }, 0) / period;
    
    const standardDeviation = Math.sqrt(variance);
    
    return {
        upper: sma + (standardDeviation * stdDev),
        middle: sma,
        lower: sma - (standardDeviation * stdDev)
    };
}

// Utility Functions
function getCryptoName(pair) {
    const names = {
        'btc_jpy': 'BTC',
        'eth_jpy': 'ETH',
        'xrp_jpy': 'XRP',
        'ltc_jpy': 'LTC'
    };
    return names[pair] || pair;
}

function showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('デイトレードアドバイザー', {
            body: message,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">⚡</text></svg>'
        });
    }
}

function showHistory() {
    if (priceHistory.length === 0) {
        alert('まだ履歴データがありません');
        return;
    }
    
    const recent = priceHistory.slice(-20).reverse();
    let message = `${getCryptoName(currentPair)}の価格履歴 (最新20件):\n\n`;
    
    recent.forEach(h => {
        const time = new Date(h.timestamp).toLocaleTimeString('ja-JP');
        const price = formatPrice(h.price, currentPair);
        message += `${time}: ${price}\n`;
    });
    
    alert(message);
}

function loadSettings() {
    // Load price alerts from localStorage
    const saved = localStorage.getItem('priceAlerts');
    if (saved) {
        priceAlerts = JSON.parse(saved);
        updateAlertList();
    }
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function savePriceAlerts() {
    localStorage.setItem('priceAlerts', JSON.stringify(priceAlerts));
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (updateInterval) clearInterval(updateInterval);
});
