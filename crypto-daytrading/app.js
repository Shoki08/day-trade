// Configuration
const CONFIG = {
    API_BASE: 'https://coincheck.com/api',
    // 複数のCORSプロキシを用意
    CORS_PROXIES: [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest='
    ],
    REFRESH_INTERVAL: 5000, // 5秒 (デイトレード向け)
    CHART_POINTS: 100,
    ORDERBOOK_DEPTH: 5,
    USE_CORS_PROXY: false, // まず直接アクセスを試みる
    DEMO_MODE: false,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000
};

// State
let currentPair = 'btc_jpy';
let currentTimeframe = '5m';
let currentTab = 'overview';
let priceHistory = [];
let candleData = [];
let lastPrice = null;
let chart = null;
let priceAlerts = [];
let updateInterval = null;
let currentProxyIndex = 0;
let apiFailCount = 0;

// All supported pairs
const ALL_PAIRS = [
    'btc_jpy', 'eth_jpy', 'xrp_jpy', 'shib_jpy', 'pepe_jpy', 'matic_jpy',
    'link_jpy', 'dot_jpy', 'avax_jpy', 'sand_jpy', 'mana_jpy', 'axs_jpy',
    'enj_jpy', 'imx_jpy', 'ape_jpy', 'chz_jpy', 'ltc_jpy', 'bch_jpy',
    'etc_jpy', 'xlm_jpy', 'xem_jpy', 'lsk_jpy', 'bat_jpy', 'iost_jpy',
    'qtum_jpy', 'fnct_jpy', 'grt_jpy', 'mask_jpy', 'mona_jpy', 'wbtc_jpy',
    'fpl_jpy', 'doge_jpy', 'bril_jpy'
];

let allCurrenciesData = {};
let allCurrenciesHistory = {};
let overviewUpdateInterval = null;

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
    
    // Start with overview tab
    if (currentTab === 'overview') {
        fetchAllCurrencies();
        overviewUpdateInterval = setInterval(fetchAllCurrencies, CONFIG.REFRESH_INTERVAL * 2); // 10秒ごと
    } else {
        startDataFetching();
    }
}

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });

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

    // Refresh buttons
    elements.refreshBtn.addEventListener('click', () => {
        fetchData();
        fetchOrderBook();
    });

    const refreshOverviewBtn = document.getElementById('refreshOverviewBtn');
    if (refreshOverviewBtn) {
        refreshOverviewBtn.addEventListener('click', () => {
            refreshOverviewBtn.disabled = true;
            refreshOverviewBtn.textContent = '🔄 分析中...';
            fetchAllCurrencies().finally(() => {
                refreshOverviewBtn.disabled = false;
                refreshOverviewBtn.textContent = '🔄 全通貨を再分析';
            });
        });
    }

    // History button
    elements.historyBtn.addEventListener('click', showHistory);

    // Recommendation item click
    document.addEventListener('click', (e) => {
        const item = e.target.closest('.recommendation-item-overview');
        if (item && item.dataset.pair) {
            currentPair = item.dataset.pair;
            switchTab('individual');
            // Update select
            elements.cryptoBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.pair === currentPair);
            });
            priceHistory = [];
            candleData = [];
            fetchData();
        }
    });
}

function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        if (isActive) {
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            btn.style.color = 'white';
        } else {
            btn.style.background = '#334155';
            btn.style.color = '#f1f5f9';
        }
    });
    
    // Update content visibility
    const overviewContent = document.getElementById('overviewContent');
    const individualContent = document.getElementById('individualContent');
    
    if (tab === 'overview') {
        overviewContent.style.display = 'block';
        individualContent.style.display = 'none';
        
        // Clear individual interval
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        
        // Start overview updates
        fetchAllCurrencies();
        if (!overviewUpdateInterval) {
            overviewUpdateInterval = setInterval(fetchAllCurrencies, CONFIG.REFRESH_INTERVAL * 2);
        }
    } else {
        overviewContent.style.display = 'none';
        individualContent.style.display = 'block';
        
        // Clear overview interval
        if (overviewUpdateInterval) {
            clearInterval(overviewUpdateInterval);
            overviewUpdateInterval = null;
        }
        
        // Start individual updates
        startDataFetching();
    }
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

async function fetchWithRetry(url, retries = CONFIG.RETRY_ATTEMPTS) {
    for (let i = 0; i < retries; i++) {
        try {
            // First try: Direct API access
            if (!CONFIG.USE_CORS_PROXY && i === 0) {
                try {
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                        },
                        mode: 'cors'
                    });
                    
                    if (response.ok) {
                        apiFailCount = 0;
                        const data = await response.json();
                        return data;
                    }
                } catch (directError) {
                    console.log('Direct API failed, trying with proxy...');
                    CONFIG.USE_CORS_PROXY = true;
                }
            }
            
            // Try with CORS proxy
            if (CONFIG.USE_CORS_PROXY) {
                const proxy = CONFIG.CORS_PROXIES[currentProxyIndex];
                const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
                
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    }
                });
                
                if (response.ok) {
                    apiFailCount = 0;
                    const data = await response.json();
                    return data;
                }
                
                // Try next proxy
                currentProxyIndex = (currentProxyIndex + 1) % CONFIG.CORS_PROXIES.length;
            }
            
        } catch (error) {
            console.error(`Fetch attempt ${i + 1} failed:`, error);
            
            if (i < retries - 1) {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * (i + 1)));
            }
        }
    }
    
    // All retries failed
    apiFailCount++;
    throw new Error('API request failed after all retries');
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
        
        // Switch to demo mode if too many failures
        if (apiFailCount > 5 && !CONFIG.DEMO_MODE) {
            CONFIG.DEMO_MODE = true;
            showDemoModeWarning();
        }
    }
}

async function fetchTicker(pair) {
    try {
        const url = `${CONFIG.API_BASE}/ticker?pair=${pair}`;
        const data = await fetchWithRetry(url);
        
        // データ検証
        if (!data || !data.last) {
            throw new Error('Invalid data received');
        }
        
        return data;
    } catch (error) {
        console.error('Fetch ticker error:', error);
        
        // デモモードに切り替え
        if (!CONFIG.DEMO_MODE) {
            console.warn('Switching to DEMO MODE');
            CONFIG.DEMO_MODE = true;
            showDemoModeWarning();
        }
        
        // デモデータを返す
        return generateDemoData(pair);
    }
}

// Demo data generation
function generateDemoData(pair) {
    const basePrice = {
        'btc_jpy': 8500000, 'eth_jpy': 450000, 'xrp_jpy': 95,
        'shib_jpy': 0.003, 'pepe_jpy': 0.0015, 'matic_jpy': 120,
        'link_jpy': 2800, 'dot_jpy': 1200, 'avax_jpy': 6500,
        'sand_jpy': 85, 'mana_jpy': 75, 'axs_jpy': 1200,
        'enj_jpy': 68, 'imx_jpy': 350, 'ape_jpy': 280, 'chz_jpy': 18,
        'ltc_jpy': 12000, 'bch_jpy': 65000, 'etc_jpy': 4500,
        'xlm_jpy': 19, 'xem_jpy': 8.5, 'lsk_jpy': 185,
        'bat_jpy': 42, 'iost_jpy': 1.8, 'qtum_jpy': 550,
        'fnct_jpy': 35, 'grt_jpy': 38, 'mask_jpy': 620,
        'mona_jpy': 95, 'wbtc_jpy': 8500000, 'fpl_jpy': 8.2,
        'doge_jpy': 22, 'bril_jpy': 145
    };
    
    const base = basePrice[pair] || 1000;
    const variation = base * 0.02;
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

function showDemoModeWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white; padding: 16px 24px; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 10000;
        font-weight: 600; max-width: 90%; text-align: center;
    `;
    warning.innerHTML = `
        ⚠️ デモモード<br>
        <span style="font-size: 14px; font-weight: normal;">
        APIエラーのため、デモデータを表示しています
        </span>
    `;
    document.body.appendChild(warning);
    
    setTimeout(() => {
        warning.style.transition = 'opacity 0.5s';
        warning.style.opacity = '0';
        setTimeout(() => warning.remove(), 500);
    }, 5000);
}

async function fetchOrderBook() {
    try {
        const url = `${CONFIG.API_BASE}/order_books?pair=${currentPair}`;
        const data = await fetchWithRetry(url);
        displayOrderBook(data);
    } catch (error) {
        console.error('Order book error:', error);
        if (CONFIG.DEMO_MODE) {
            displayOrderBook(generateDemoOrderBook());
        } else {
            displayOrderBookError();
        }
    }
}

function generateDemoOrderBook() {
    const basePrice = lastPrice || 8500000;
    const asks = [];
    const bids = [];
    
    for (let i = 0; i < 10; i++) {
        const price = basePrice * (1 + (i + 1) * 0.001);
        const amount = Math.random() * 0.5 + 0.1;
        asks.push([price.toString(), amount.toString()]);
    }
    
    for (let i = 0; i < 10; i++) {
        const price = basePrice * (1 - (i + 1) * 0.001);
        const amount = Math.random() * 0.5 + 0.1;
        bids.push([price.toString(), amount.toString()]);
    }
    
    return { asks, bids };
}

function displayOrderBookError() {
    elements.orderbook.innerHTML = `
        <div class="orderbook-row">
            <div>価格</div><div>数量</div><div>累積</div>
        </div>
        <div style="text-align: center; padding: 20px; color: #ef4444;">
            板情報の取得に失敗しました
        </div>
    `;
}

function updateStatus(status) {
    const statusMap = {
        connecting: { dot: 'offline', text: '接続中...' },
        connected: { dot: '', text: CONFIG.DEMO_MODE ? 'デモモード（更新中）' : 'リアルタイム更新中' },
        disconnected: { dot: 'offline', text: '接続エラー' }
    };
    
    const s = statusMap[status];
    if (elements.statusDot) {
        elements.statusDot.className = `status-dot ${s.dot}`;
        elements.statusText.textContent = s.text;
    }
    
    // Update overview status too
    const statusDotOverview = document.getElementById('statusDotOverview');
    const statusTextOverview = document.getElementById('statusTextOverview');
    if (statusDotOverview && statusTextOverview) {
        statusDotOverview.className = `status-dot ${s.dot}`;
        statusTextOverview.textContent = s.text;
    }
}

function updatePriceDisplay(ticker) {
    const price = parseFloat(ticker.last);
    
    elements.currentPrice.textContent = formatPrice(price, currentPair);
    
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
    
    elements.high24h.textContent = formatPrice(parseFloat(ticker.high), currentPair);
    elements.low24h.textContent = formatPrice(parseFloat(ticker.low), currentPair);
    elements.volume24h.textContent = parseFloat(ticker.volume).toFixed(2);
    
    const now = new Date();
    elements.updateTime.textContent = `最終更新: ${now.toLocaleTimeString('ja-JP')}`;
}

function formatPrice(price, pair) {
    if (price >= 100000) {
        return `¥${price.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
    } else if (price >= 1000) {
        return `¥${price.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    } else if (price >= 10) {
        return `¥${price.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (price >= 0.01) {
        return `¥${price.toFixed(4)}`;
    } else {
        return `¥${price.toFixed(6)}`;
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
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
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
                    grid: { color: '#334155', drawBorder: false },
                    ticks: { color: '#94a3b8', maxTicksLimit: 6 }
                },
                y: {
                    display: true,
                    grid: { color: '#334155', drawBorder: false },
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
    
    // Asks
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
    
    html += `<div style="height: 2px; background: #475569; margin: 4px 0;"></div>`;
    
    // Bids
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

window.removeAlert = function(id) {
    priceAlerts = priceAlerts.filter(a => a.id !== id);
    updateAlertList();
    savePriceAlerts();
}

function checkPriceAlerts(currentPrice) {
    priceAlerts.forEach(alert => {
        if (!alert.triggered && alert.pair === currentPair) {
            const diff = Math.abs(currentPrice - alert.price);
            const threshold = alert.price * 0.001;
            
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

// ============================================
// Overview / All Currencies Analysis
// ============================================

async function fetchAllCurrencies() {
    updateStatusOverview('connecting', '全通貨を分析中...');
    
    const results = [];
    const batchSize = 3; // Reduced batch size for stability
    
    for (let i = 0; i < ALL_PAIRS.length; i += batchSize) {
        const batch = ALL_PAIRS.slice(i, i + batchSize);
        const batchPromises = batch.map(pair => fetchTickerForOverview(pair));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Progress
        const progress = Math.min(100, Math.round(((i + batch.length) / ALL_PAIRS.length) * 100));
        updateStatusOverview('connecting', `分析中... ${progress}%`);
        
        // Wait to avoid rate limits
        if (i + batchSize < ALL_PAIRS.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    
    // Save data
    results.forEach(data => {
        if (data && data.pair && data.ticker) {
            allCurrenciesData[data.pair] = data.ticker;
            
            if (!allCurrenciesHistory[data.pair]) {
                allCurrenciesHistory[data.pair] = [];
            }
            allCurrenciesHistory[data.pair].push({
                price: parseFloat(data.ticker.last),
                timestamp: Date.now()
            });
            
            if (allCurrenciesHistory[data.pair].length > 100) {
                allCurrenciesHistory[data.pair] = allCurrenciesHistory[data.pair].slice(-100);
            }
        }
    });
    
    // Analyze and display
    analyzeAllCurrencies();
    updateStatusOverview('connected', CONFIG.DEMO_MODE ? 'デモモード' : '接続中');
    
    // Update time
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP');
    const updateTimeOverview = document.getElementById('updateTimeOverview');
    if (updateTimeOverview) {
        updateTimeOverview.textContent = `最終更新: ${timeStr}`;
    }
}

async function fetchTickerForOverview(pair) {
    try {
        const ticker = await fetchTicker(pair);
        return { pair, ticker };
    } catch (error) {
        console.error(`Error fetching ${pair}:`, error);
        return { pair, ticker: null };
    }
}

function analyzeAllCurrencies() {
    const analyses = [];
    
    ALL_PAIRS.forEach(pair => {
        const history = allCurrenciesHistory[pair];
        if (!history || history.length < 14) return;
        
        const prices = history.map(h => h.price);
        const currentPrice = prices[prices.length - 1];
        const previousPrice = prices[prices.length - 2] || currentPrice;
        
        // Calculate indicators
        const rsi = calculateRSI(prices, 14);
        const sma5 = calculateSMA(prices, 5);
        const sma20 = calculateSMA(prices, 20);
        const bb = calculateBollingerBands(prices, 20, 2);
        
        // Calculate score
        let score = 0;
        let reasons = [];
        
        // RSI
        if (rsi < 30) {
            score += 3;
            reasons.push('RSI売られすぎ');
        } else if (rsi < 40) {
            score += 1;
            reasons.push('RSI低め');
        } else if (rsi > 70) {
            score -= 3;
            reasons.push('RSI買われすぎ');
        } else if (rsi > 60) {
            score -= 1;
            reasons.push('RSI高め');
        }
        
        // Moving averages
        if (sma5 > sma20) {
            const crossStrength = ((sma5 - sma20) / sma20) * 100;
            if (crossStrength > 2) {
                score += 2;
                reasons.push('強い上昇トレンド');
            } else {
                score += 1;
                reasons.push('上昇トレンド');
            }
        } else {
            const crossStrength = ((sma20 - sma5) / sma20) * 100;
            if (crossStrength > 2) {
                score -= 2;
                reasons.push('強い下降トレンド');
            } else {
                score -= 1;
                reasons.push('下降トレンド');
            }
        }
        
        // Bollinger Bands
        if (currentPrice < bb.lower) {
            score += 2;
            reasons.push('BB下限突破');
        } else if (currentPrice > bb.upper) {
            score -= 2;
            reasons.push('BB上限突破');
        }
        
        // Price change
        const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;
        
        // Signal
        let signal = 'hold';
        let signalStrength = 'weak';
        
        if (score >= 3) {
            signal = 'buy';
            if (score >= 5) signalStrength = 'strong';
            else if (score >= 4) signalStrength = 'moderate';
        } else if (score <= -3) {
            signal = 'sell';
            if (score <= -5) signalStrength = 'strong';
            else if (score <= -4) signalStrength = 'moderate';
        }
        
        analyses.push({
            pair, signal, signalStrength,
            score: Math.abs(score),
            reasons: reasons.slice(0, 2),
            price: currentPrice,
            priceChange, rsi, sma5, sma20
        });
    });
    
    displayOverviewAnalysis(analyses);
}

function displayOverviewAnalysis(analyses) {
    const buySignals = analyses.filter(a => a.signal === 'buy');
    const sellSignals = analyses.filter(a => a.signal === 'sell');
    const holdSignals = analyses.filter(a => a.signal === 'hold');
    
    document.getElementById('buyCountOverview').textContent = buySignals.length;
    document.getElementById('sellCountOverview').textContent = sellSignals.length;
    document.getElementById('holdCountOverview').textContent = holdSignals.length;
    
    const topBuys = buySignals.sort((a, b) => b.score - a.score).slice(0, 10);
    const topSells = sellSignals.sort((a, b) => b.score - a.score).slice(0, 10);
    
    displayRecommendationsOverview('buy', topBuys);
    displayRecommendationsOverview('sell', topSells);
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP');
    document.getElementById('buyRefreshTimeOverview').textContent = timeStr;
    document.getElementById('sellRefreshTimeOverview').textContent = timeStr;
}

function displayRecommendationsOverview(type, recommendations) {
    const containerId = type === 'buy' ? 'buyRecommendationsOverview' : 'sellRecommendationsOverview';
    const container = document.getElementById(containerId);
    
    if (recommendations.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #64748b;">
                現在${type === 'buy' ? '買い' : '売り'}推奨の通貨はありません
            </div>
        `;
        return;
    }
    
    let html = '';
    recommendations.forEach((rec, index) => {
        const strengthClass = rec.signalStrength;
        const strengthText = {
            strong: '強',
            moderate: '中',
            weak: '弱'
        }[strengthClass];
        
        const changeClass = rec.priceChange >= 0 ? 'positive' : 'negative';
        const changeSymbol = rec.priceChange >= 0 ? '+' : '';
        
        html += `
            <div class="recommendation-item-overview ${type}" data-pair="${rec.pair}" style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: #0f172a; border: 1px solid #334155; border-left: 4px solid ${type === 'buy' ? '#10b981' : '#ef4444'}; border-radius: 12px; cursor: pointer; transition: all 0.3s;">
                <div style="display: flex; align-items: center; gap: 16px; flex: 1;">
                    <div style="font-size: 24px; font-weight: 700; color: #10b981; min-width: 40px; text-align: center;">${index + 1}</div>
                    <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 600; color: #f1f5f9; margin-bottom: 4px;">${getCryptoName(rec.pair)}</div>
                        <div style="font-size: 13px; color: #94a3b8;">${rec.reasons.join(' / ')}</div>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                    <div>
                        <span style="padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 600; background: ${strengthClass === 'strong' ? '#d1fae5' : strengthClass === 'moderate' ? '#fef3c7' : '#e0e7ff'}; color: ${strengthClass === 'strong' ? '#065f46' : strengthClass === 'moderate' ? '#92400e' : '#3730a3'};">
                            スコア: ${rec.score} (${strengthText})
                        </span>
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: #f1f5f9; text-align: right;">${formatPrice(rec.price, rec.pair)}</div>
                    <div style="font-size: 14px; font-weight: 600; color: ${rec.priceChange >= 0 ? '#10b981' : '#ef4444'}; text-align: right;">
                        ${changeSymbol}${rec.priceChange.toFixed(2)}%
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function updateStatusOverview(status, text) {
    const statusDot = document.getElementById('statusDotOverview');
    const statusText = document.getElementById('statusTextOverview');
    
    if (statusDot && statusText) {
        const statusMap = {
            connecting: 'offline',
            connected: '',
            disconnected: 'offline'
        };
        statusDot.className = `status-dot ${statusMap[status]}`;
        statusText.textContent = text;
    }
}

// Utility Functions
function getCryptoName(pair) {
    const names = {
        'btc_jpy': 'BTC', 'eth_jpy': 'ETH', 'xrp_jpy': 'XRP',
        'shib_jpy': 'SHIB', 'pepe_jpy': 'PEPE', 'matic_jpy': 'MATIC',
        'link_jpy': 'LINK', 'dot_jpy': 'DOT', 'avax_jpy': 'AVAX',
        'sand_jpy': 'SAND', 'mana_jpy': 'MANA', 'axs_jpy': 'AXS',
        'enj_jpy': 'ENJ', 'imx_jpy': 'IMX', 'ape_jpy': 'APE', 'chz_jpy': 'CHZ',
        'ltc_jpy': 'LTC', 'bch_jpy': 'BCH', 'etc_jpy': 'ETC',
        'xlm_jpy': 'XLM', 'xem_jpy': 'XEM', 'lsk_jpy': 'LSK',
        'bat_jpy': 'BAT', 'iost_jpy': 'IOST', 'qtum_jpy': 'QTUM',
        'fnct_jpy': 'FNCT', 'grt_jpy': 'GRT', 'mask_jpy': 'MASK',
        'mona_jpy': 'MONA', 'wbtc_jpy': 'WBTC', 'fpl_jpy': 'FPL',
        'doge_jpy': 'DOGE', 'bril_jpy': 'BRIL'
    };
    return names[pair] || pair.replace('_jpy', '').toUpperCase();
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
    const saved = localStorage.getItem('priceAlerts');
    if (saved) {
        priceAlerts = JSON.parse(saved);
        updateAlertList();
    }
    
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function savePriceAlerts() {
    localStorage.setItem('priceAlerts', JSON.stringify(priceAlerts));
}

window.addEventListener('beforeunload', () => {
    if (updateInterval) clearInterval(updateInterval);
    if (overviewUpdateInterval) clearInterval(overviewUpdateInterval);
});
