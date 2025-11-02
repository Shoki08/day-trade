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
let priceHistory = [];
let lastPrice = null;
let notificationsEnabled = false;
let deferredPrompt = null;

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
    fetchData();
    setInterval(fetchData, CONFIG.REFRESH_INTERVAL);
    setupInstallPrompt();
}

function setupEventListeners() {
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
    if (pair.includes('btc') || pair.includes('eth')) {
        return `¥${price.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`;
    } else {
        return `¥${price.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        'btc_jpy': 'ビットコイン',
        'eth_jpy': 'イーサリアム',
        'xrp_jpy': 'リップル',
        'ltc_jpy': 'ライトコイン'
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
