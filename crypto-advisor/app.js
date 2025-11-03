// Configuration
const CONFIG = {
    API_BASE: 'https://coincheck.com/api',
    // CORSプロキシを使用（本番環境では独自プロキシを推奨）
    CORS_PROXY: 'https://api.allorigins.win/raw?url=',
    REFRESH_INTERVAL: 60000, // 1分
    HISTORY_LIMIT: 100,
    USE_CORS_PROXY: true, // CORSエラー対策
    DEMO_MODE: false // デモモード（APIエラー時に自動的にON）
};

// State
let currentPair = 'btc_jpy';
let currentTab = 'overview';
let priceHistory = [];
let allCurrenciesData = {};
let allCurrenciesHistory = {};
let lastPrice = null;
let notificationsEnabled = false;
let deferredPrompt = null;
let overviewUpdateInterval = null;

// All supported pairs
const ALL_PAIRS = [
    'btc_jpy', 'eth_jpy', 'xrp_jpy', 'shib_jpy', 'pepe_jpy', 'matic_jpy',
    'link_jpy', 'dot_jpy', 'avax_jpy', 'sand_jpy', 'mana_jpy', 'axs_jpy',
    'enj_jpy', 'imx_jpy', 'ape_jpy', 'chz_jpy', 'ltc_jpy', 'bch_jpy',
    'etc_jpy', 'xlm_jpy', 'xem_jpy', 'lsk_jpy', 'bat_jpy', 'iost_jpy',
    'qtum_jpy', 'fnct_jpy', 'grt_jpy', 'mask_jpy', 'mona_jpy', 'wbtc_jpy',
    'fpl_jpy', 'doge_jpy', 'bril_jpy'
];

// DOM Elements
const elements = {
    statusBadge: document.getElementById('statusBadge'),
    statusText: document.getElementById('statusText'),
    cryptoSelect: document.getElementById('cryptoSelect'),
    currentPrice: document.getElementById('currentPrice'),
    priceChange: document.getElementById('priceChange'),
    signalBadge: document.getElementById('signalBadge'),
    signalContent: document.getElementById('signalContent'),
    notificationToggle: document.getElementById('notificationToggle'),
    refreshButton: document.getElementById('refreshButton'),
    historyButton: document.getElementById('historyButton'),
    installPrompt: document.getElementById('installPrompt'),
    installButton: document.getElementById('installButton')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupEventListeners();
    loadSettings();
    setupInstallPrompt();
    
    // Start with overview tab
    if (currentTab === 'overview') {
        fetchAllCurrencies();
        overviewUpdateInterval = setInterval(fetchAllCurrencies, CONFIG.REFRESH_INTERVAL);
    } else {
        fetchData();
        setInterval(fetchData, CONFIG.REFRESH_INTERVAL);
    }
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });

    // Crypto selector (individual tab)
    elements.cryptoSelect.addEventListener('change', (e) => {
        currentPair = e.target.value;
        priceHistory = [];
        fetchData();
    });

    elements.notificationToggle.addEventListener('change', (e) => {
        handleNotificationToggle(e.target.checked);
    });

    elements.refreshButton.addEventListener('click', () => {
        elements.refreshButton.disabled = true;
        elements.refreshButton.textContent = '🔄 更新中...';
        fetchData().finally(() => {
            elements.refreshButton.disabled = false;
            elements.refreshButton.textContent = '🔄 更新';
        });
    });

    elements.historyButton.addEventListener('click', showHistory);

    // Overview tab refresh
    const refreshOverviewButton = document.getElementById('refreshOverviewButton');
    if (refreshOverviewButton) {
        refreshOverviewButton.addEventListener('click', () => {
            refreshOverviewButton.disabled = true;
            refreshOverviewButton.textContent = '🔄 分析中...';
            fetchAllCurrencies().finally(() => {
                refreshOverviewButton.disabled = false;
                refreshOverviewButton.textContent = '🔄 全通貨を再分析';
            });
        });
    }

    // Recommendation item click
    document.addEventListener('click', (e) => {
        const item = e.target.closest('.recommendation-item');
        if (item && item.dataset.pair) {
            currentPair = item.dataset.pair;
            switchTab('individual');
            // Update select
            elements.cryptoSelect.value = currentPair;
            priceHistory = [];
            fetchData();
        }
    });
}

function switchTab(tab) {
    currentTab = tab;
    
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}Tab`);
    });
    
    // Start/stop overview updates
    if (tab === 'overview') {
        fetchAllCurrencies();
        if (!overviewUpdateInterval) {
            overviewUpdateInterval = setInterval(fetchAllCurrencies, CONFIG.REFRESH_INTERVAL);
        }
    } else {
        if (overviewUpdateInterval) {
            clearInterval(overviewUpdateInterval);
            overviewUpdateInterval = null;
        }
    }
}

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        elements.installPrompt.classList.add('show');
    });

    elements.installButton.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        deferredPrompt = null;
        elements.installPrompt.classList.remove('show');
    });
}

async function fetchData() {
    try {
        updateStatus('loading', '取得中...');
        
        // Fetch ticker data
        const ticker = await fetchTicker(currentPair);
        
        if (ticker && ticker.last) {
            const price = parseFloat(ticker.last);
            priceHistory.push({
                price: price,
                timestamp: Date.now()
            });

            // Keep only recent history
            if (priceHistory.length > CONFIG.HISTORY_LIMIT) {
                priceHistory = priceHistory.slice(-CONFIG.HISTORY_LIMIT);
            }

            updatePriceDisplay(price);
            
            // Calculate and display signal
            if (priceHistory.length >= 14) {
                const signal = calculateSignal();
                displaySignal(signal);
            } else {
                showLoadingSignal();
            }

            updateStatus('connected', CONFIG.DEMO_MODE ? 'デモモード' : '接続中');
            lastPrice = price;
        } else {
            throw new Error('Invalid data received');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        updateStatus('disconnected', 'エラー');
        
        // エラー詳細を表示
        showError(`データ取得エラー: ${error.message}`);
    }
}

// データ収集中のシグナル表示
function showLoadingSignal() {
    elements.signalContent.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="spinner"></div>
            <p style="margin-top: 12px;">データを収集中...</p>
            <p style="font-size: 13px; color: #666; margin-top: 8px;">
                ${priceHistory.length} / 14 データポイント
            </p>
        </div>
    `;
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
        // 主要通貨
        'btc_jpy': 8500000,
        'eth_jpy': 450000,
        'xrp_jpy': 95,
        
        // 人気アルトコイン
        'shib_jpy': 0.003,
        'pepe_jpy': 0.0015,
        'matic_jpy': 120,
        'link_jpy': 2800,
        'dot_jpy': 1200,
        'avax_jpy': 6500,
        
        // DeFi・NFT関連
        'sand_jpy': 85,
        'mana_jpy': 75,
        'axs_jpy': 1200,
        'enj_jpy': 68,
        'imx_jpy': 350,
        'ape_jpy': 280,
        'chz_jpy': 18,
        
        // 主要アルトコイン
        'ltc_jpy': 12000,
        'bch_jpy': 65000,
        'etc_jpy': 4500,
        'xlm_jpy': 19,
        'xem_jpy': 8.5,
        'lsk_jpy': 185,
        
        // DeFi・取引所トークン
        'bat_jpy': 42,
        'iost_jpy': 1.8,
        'qtum_jpy': 550,
        'fnct_jpy': 35,
        'grt_jpy': 38,
        'mask_jpy': 620,
        
        // その他
        'mona_jpy': 95,
        'wbtc_jpy': 8500000,
        'fpl_jpy': 8.2,
        'doge_jpy': 22,
        'bril_jpy': 145
    };
    
    const base = basePrice[pair] || 1000;
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

function updateStatus(status, text) {
    elements.statusBadge.className = `status-badge ${status}`;
    elements.statusText.textContent = text;
}

function updatePriceDisplay(price) {
    // Format price based on currency
    const formatted = formatPrice(price, currentPair);
    elements.currentPrice.textContent = formatted;

    // Calculate price change
    if (lastPrice !== null) {
        const change = price - lastPrice;
        const changePercent = ((change / lastPrice) * 100).toFixed(2);
        const changeClass = change >= 0 ? 'positive' : 'negative';
        const changeSymbol = change >= 0 ? '▲' : '▼';
        
        elements.priceChange.textContent = `${changeSymbol} ${Math.abs(changePercent)}%`;
        elements.priceChange.className = `price-change ${changeClass}`;
    }
}

function formatPrice(price, pair) {
    // 価格の大きさに応じてフォーマット
    if (price >= 100000) {
        // 10万円以上（BTC, ETH, BCH, WBTCなど）
        return `¥${price.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
    } else if (price >= 1000) {
        // 1000円以上（多くのアルトコイン）
        return `¥${price.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    } else if (price >= 10) {
        // 10円以上
        return `¥${price.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (price >= 0.01) {
        // 0.01円以上
        return `¥${price.toFixed(4)}`;
    } else {
        // 0.01円未満（SHIB, PEPEなど）
        return `¥${price.toFixed(6)}`;
    }
}

function calculateSignal() {
    const prices = priceHistory.map(h => h.price);
    
    // Calculate RSI
    const rsi = calculateRSI(prices, 14);
    
    // Calculate Moving Averages
    const sma7 = calculateSMA(prices, 7);
    const sma25 = calculateSMA(prices, 25);
    
    // Calculate MACD
    const macd = calculateMACD(prices);
    
    // Generate signal
    let signal = 'hold';
    let strength = 0;
    let reasons = [];

    // RSI Analysis
    if (rsi < 30) {
        strength += 2;
        reasons.push('RSIが売られすぎ水準(30以下)');
    } else if (rsi > 70) {
        strength -= 2;
        reasons.push('RSIが買われすぎ水準(70以上)');
    }

    // Moving Average Analysis
    if (sma7 > sma25) {
        strength += 1;
        reasons.push('短期移動平均が長期を上回る(上昇トレンド)');
    } else if (sma7 < sma25) {
        strength -= 1;
        reasons.push('短期移動平均が長期を下回る(下降トレンド)');
    }

    // MACD Analysis
    if (macd.histogram > 0) {
        strength += 1;
        reasons.push('MACDがプラス圏(買いシグナル)');
    } else if (macd.histogram < 0) {
        strength -= 1;
        reasons.push('MACDがマイナス圏(売りシグナル)');
    }

    // Determine final signal
    if (strength >= 2) {
        signal = 'buy';
    } else if (strength <= -2) {
        signal = 'sell';
    }

    return {
        signal,
        strength: Math.abs(strength),
        rsi: rsi.toFixed(2),
        sma7: sma7.toFixed(0),
        sma25: sma25.toFixed(0),
        macd: macd.histogram.toFixed(2),
        reasons
    };
}

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

function calculateMACD(prices) {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;
    
    return {
        line: macdLine,
        histogram: macdLine // Simplified
    };
}

function calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = prices.length - period + 1; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
}

function displaySignal(signal) {
    // Update badge
    elements.signalBadge.className = `signal-badge ${signal.signal}`;
    elements.signalBadge.textContent = getSignalText(signal.signal);

    // Build signal content
    const content = `
        <div class="signal-details">
            <div class="signal-item">
                <span class="signal-label">RSI (14)</span>
                <span class="signal-value">${signal.rsi}</span>
            </div>
            <div class="signal-item">
                <span class="signal-label">短期移動平均 (7日)</span>
                <span class="signal-value">¥${parseFloat(signal.sma7).toLocaleString()}</span>
            </div>
            <div class="signal-item">
                <span class="signal-label">長期移動平均 (25日)</span>
                <span class="signal-value">¥${parseFloat(signal.sma25).toLocaleString()}</span>
            </div>
            <div class="signal-item">
                <span class="signal-label">MACD</span>
                <span class="signal-value">${signal.macd}</span>
            </div>
        </div>

        <div class="explanation">
            <h3>💡 分析結果</h3>
            <p>${signal.reasons.join('。')}</p>
            <br>
            <p><strong>推奨:</strong> ${getRecommendation(signal.signal)}</p>
        </div>
    `;

    elements.signalContent.innerHTML = content;

    // Send notification if enabled
    if (notificationsEnabled && (signal.signal === 'buy' || signal.signal === 'sell')) {
        sendNotification(signal);
    }
}

function getSignalText(signal) {
    const texts = {
        buy: '買い推奨',
        sell: '売り推奨',
        hold: '様子見'
    };
    return texts[signal] || '待機';
}

function getRecommendation(signal) {
    const recommendations = {
        buy: '購入を検討するタイミングです。ただし、少額から始めることをお勧めします。',
        sell: '利益確定や損切りを検討するタイミングです。市場の状況を確認しましょう。',
        hold: '現在は積極的な売買タイミングではありません。市場の動きを注視しましょう。'
    };
    return recommendations[signal] || '市場を観察しましょう。';
}

async function handleNotificationToggle(enabled) {
    notificationsEnabled = enabled;
    localStorage.setItem('notificationsEnabled', enabled);

    if (enabled) {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                elements.notificationToggle.checked = false;
                notificationsEnabled = false;
                alert('通知の許可が必要です');
            } else {
                sendNotification({ signal: 'buy', reasons: ['通知が有効になりました'] }, true);
            }
        }
    }
}

function sendNotification(signal, isTest = false) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = isTest ? '🔔 通知テスト' : `${getSignalText(signal.signal)} - ${getCryptoName(currentPair)}`;
    const body = isTest ? '通知が正常に動作しています' : signal.reasons[0] || '市場の動きをチェックしてください';

    const notification = new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">💰</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">💰</text></svg>',
        tag: 'crypto-signal',
        requireInteraction: false
    });

    notification.onclick = () => {
        window.focus();
        notification.close();
    };
}

function getCryptoName(pair) {
    const names = {
        // 主要通貨
        'btc_jpy': 'ビットコイン',
        'eth_jpy': 'イーサリアム',
        'xrp_jpy': 'リップル',
        
        // 人気アルトコイン
        'shib_jpy': '柴犬コイン',
        'pepe_jpy': 'ペペコイン',
        'matic_jpy': 'ポリゴン',
        'link_jpy': 'チェーンリンク',
        'dot_jpy': 'ポルカドット',
        'avax_jpy': 'アバランチ',
        
        // DeFi・NFT関連
        'sand_jpy': 'サンドボックス',
        'mana_jpy': 'ディセントラランド',
        'axs_jpy': 'アクシー',
        'enj_jpy': 'エンジンコイン',
        'imx_jpy': 'Immutable X',
        'ape_jpy': 'ApeCoin',
        'chz_jpy': 'Chiliz',
        
        // 主要アルトコイン
        'ltc_jpy': 'ライトコイン',
        'bch_jpy': 'ビットコインキャッシュ',
        'etc_jpy': 'イーサリアムクラシック',
        'xlm_jpy': 'ステラルーメン',
        'xem_jpy': 'ネム',
        'lsk_jpy': 'リスク',
        
        // DeFi・取引所トークン
        'bat_jpy': 'BAT',
        'iost_jpy': 'IOST',
        'qtum_jpy': 'Qtum',
        'fnct_jpy': 'Fnality',
        'grt_jpy': 'The Graph',
        'mask_jpy': 'Mask Network',
        
        // その他
        'mona_jpy': 'モナコイン',
        'wbtc_jpy': 'Wrapped Bitcoin',
        'fpl_jpy': 'Flare',
        'doge_jpy': 'ドージコイン',
        'bril_jpy': 'Brilliance'
    };
    return names[pair] || pair;
}

function showHistory() {
    if (priceHistory.length === 0) {
        alert('まだ履歴データがありません');
        return;
    }

    const recentHistory = priceHistory.slice(-10).reverse();
    let message = `${getCryptoName(currentPair)}の価格履歴:\n\n`;
    
    recentHistory.forEach((h, i) => {
        const time = new Date(h.timestamp).toLocaleTimeString('ja-JP');
        const price = formatPrice(h.price, currentPair);
        message += `${time}: ${price}\n`;
    });

    alert(message);
}

function showError(message) {
    elements.signalContent.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #dc2626;">
            <span style="font-size: 48px;">⚠️</span>
            <p style="margin-top: 12px;">${message}</p>
        </div>
    `;
}

function loadSettings() {
    const saved = localStorage.getItem('notificationsEnabled');
    if (saved === 'true') {
        elements.notificationToggle.checked = true;
        notificationsEnabled = true;
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateRSI,
        calculateSMA,
        calculateSignal
    };
}

// ============================================
// Overview / All Currencies Analysis
// ============================================

async function fetchAllCurrencies() {
    updateStatusOverview('loading', '全通貨を分析中...');
    
    const results = [];
    const batchSize = 5; // 5通貨ずつ取得（レート制限対策）
    
    for (let i = 0; i < ALL_PAIRS.length; i += batchSize) {
        const batch = ALL_PAIRS.slice(i, i + batchSize);
        const batchPromises = batch.map(pair => fetchTickerForOverview(pair));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 進捗表示
        const progress = Math.min(100, Math.round(((i + batch.length) / ALL_PAIRS.length) * 100));
        updateStatusOverview('loading', `分析中... ${progress}%`);
        
        // 少し待機（レート制限対策）
        if (i + batchSize < ALL_PAIRS.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // データを保存
    results.forEach(data => {
        if (data && data.pair && data.ticker) {
            allCurrenciesData[data.pair] = data.ticker;
            
            // 履歴に追加
            if (!allCurrenciesHistory[data.pair]) {
                allCurrenciesHistory[data.pair] = [];
            }
            allCurrenciesHistory[data.pair].push({
                price: parseFloat(data.ticker.last),
                timestamp: Date.now()
            });
            
            // 履歴を制限
            if (allCurrenciesHistory[data.pair].length > CONFIG.HISTORY_LIMIT) {
                allCurrenciesHistory[data.pair] = allCurrenciesHistory[data.pair].slice(-CONFIG.HISTORY_LIMIT);
            }
        }
    });
    
    // 分析して表示
    analyzeAllCurrencies();
    updateStatusOverview('connected', CONFIG.DEMO_MODE ? 'デモモード' : '接続中');
    
    // 更新時刻を表示
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP');
    document.getElementById('lastUpdateOverview').textContent = `最終更新: ${timeStr}`;
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
        
        // テクニカル指標を計算
        const rsi = calculateRSI(prices, 14);
        const sma7 = calculateSMA(prices, 7);
        const sma25 = calculateSMA(prices, 25);
        const macd = calculateMACD(prices);
        
        // スコアを計算
        let score = 0;
        let reasons = [];
        
        // RSI分析
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
        
        // 移動平均分析
        if (sma7 > sma25) {
            const crossStrength = ((sma7 - sma25) / sma25) * 100;
            if (crossStrength > 2) {
                score += 2;
                reasons.push('強い上昇トレンド');
            } else {
                score += 1;
                reasons.push('上昇トレンド');
            }
        } else {
            const crossStrength = ((sma25 - sma7) / sma25) * 100;
            if (crossStrength > 2) {
                score -= 2;
                reasons.push('強い下降トレンド');
            } else {
                score -= 1;
                reasons.push('下降トレンド');
            }
        }
        
        // MACD分析
        if (macd.histogram > 0) {
            score += 1;
            reasons.push('MACDプラス');
        } else {
            score -= 1;
            reasons.push('MACDマイナス');
        }
        
        // 価格変動
        const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;
        
        // シグナル判定
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
            pair,
            signal,
            signalStrength,
            score: Math.abs(score),
            reasons: reasons.slice(0, 2), // 上位2つの理由
            price: currentPrice,
            priceChange,
            rsi,
            sma7,
            sma25
        });
    });
    
    // 表示
    displayOverviewAnalysis(analyses);
}

function displayOverviewAnalysis(analyses) {
    // カウント
    const buySignals = analyses.filter(a => a.signal === 'buy');
    const sellSignals = analyses.filter(a => a.signal === 'sell');
    const holdSignals = analyses.filter(a => a.signal === 'hold');
    
    document.getElementById('buyCount').textContent = buySignals.length;
    document.getElementById('sellCount').textContent = sellSignals.length;
    document.getElementById('holdCount').textContent = holdSignals.length;
    
    // 買い推奨をスコア順にソート
    const topBuys = buySignals
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    
    // 売り推奨をスコア順にソート
    const topSells = sellSignals
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    
    // 買い推奨を表示
    displayRecommendations('buy', topBuys);
    
    // 売り推奨を表示
    displayRecommendations('sell', topSells);
    
    // 更新時刻
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP');
    document.getElementById('buyRefreshTime').textContent = timeStr;
    document.getElementById('sellRefreshTime').textContent = timeStr;
}

function displayRecommendations(type, recommendations) {
    const containerId = type === 'buy' ? 'buyRecommendations' : 'sellRecommendations';
    const container = document.getElementById(containerId);
    
    if (recommendations.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #999;">
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
            <div class="recommendation-item ${type}" data-pair="${rec.pair}">
                <div class="recommendation-item-left">
                    <div class="recommendation-rank">${index + 1}</div>
                    <div class="recommendation-info">
                        <div class="recommendation-name">${getCryptoName(rec.pair)}</div>
                        <div class="recommendation-reason">${rec.reasons.join(' / ')}</div>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                    <div class="recommendation-score">
                        <span class="score-badge ${strengthClass}">スコア: ${rec.score} (${strengthText})</span>
                    </div>
                    <div class="recommendation-price">${formatPrice(rec.price, rec.pair)}</div>
                    <div class="recommendation-change ${changeClass}">
                        ${changeSymbol}${rec.priceChange.toFixed(2)}%
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function updateStatusOverview(status, text) {
    const statusBadge = document.getElementById('statusBadgeOverview');
    const statusText = document.getElementById('statusTextOverview');
    
    if (statusBadge && statusText) {
        statusBadge.className = `status-badge ${status}`;
        statusText.textContent = text;
    }
}
