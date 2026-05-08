const API_BASE_URL = "https://bittu234we-slice-gateway-api.hf.space"; 
const MY_UPI_ID = "7047511725@slc";

const urlParams = new URLSearchParams(window.location.search);
const STORE_NAME = urlParams.get('store');
const PAYMENT_AMOUNT = urlParams.get('amount');
const TXN_ID = urlParams.get('txn');
const REDIRECT_URL = urlParams.get('redirect_url');

let countdownInterval;
let pollingInterval;
let timeRemaining = 180; 
let pollAttempts = 0;
const maxAttempts = 90; 

history.pushState(null, null, location.href);
window.addEventListener('popstate', function(event) {
    document.getElementById('cancel-modal').classList.add('active');
});

function dismissModal() {
    document.getElementById('cancel-modal').classList.remove('active');
    history.pushState(null, null, location.href); 
}

function cancelTransaction() {
    dismissModal();
    triggerFail("Transaction Cancelled by User");
}

window.onload = () => {
    setTimeout(() => { document.getElementById('boot-progress').style.width = '100%'; }, 100);
    
    setTimeout(() => {
        const loader = document.getElementById('boot-loader');
        loader.style.opacity = '0';
        
        setTimeout(() => {
            loader.style.visibility = 'hidden';
            
            if (!STORE_NAME || !PAYMENT_AMOUNT || !TXN_ID || !REDIRECT_URL) {
                document.getElementById("step-pay").style.display = "none";
                document.getElementById("footer-ui").style.display = "none";
                const failSection = document.getElementById("step-fail");
                failSection.style.display = "block";
                failSection.querySelector(".fail-text").innerText = "Access Denied";
                failSection.querySelector("p").innerText = "Direct access is disabled. Please initiate checkout from a secure merchant link.";
                failSection.querySelector(".retry-btn").style.display = "none"; 
                return; 
            }

            document.getElementById('main-container').classList.add('loaded'); 
            document.getElementById('store-name-display').innerText = STORE_NAME;
            document.getElementById('amount-display').innerText = `₹${PAYMENT_AMOUNT}`;
            document.getElementById('boot-logo-text').innerText = STORE_NAME.charAt(0).toUpperCase();
            document.getElementById('header-logo-text').innerText = STORE_NAME.charAt(0).toUpperCase();

            if (sessionStorage.getItem(`active_txn_${TXN_ID}`)) {
                triggerFail("Transaction Invalidated: Page Refreshed");
                return;
            } else {
                sessionStorage.setItem(`active_txn_${TXN_ID}`, "true");
            }

            generateLocalQRCode(); 
        }, 800);
    }, 1600); 
};

function generateLocalQRCode() {
    const upiLink = `upi://pay?pa=${MY_UPI_ID}&pn=${encodeURIComponent(STORE_NAME)}&am=${PAYMENT_AMOUNT}&cu=INR`;
    new QRCode(document.getElementById("qr-code"), {
        text: upiLink,
        width: 230, 
        height: 230,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H 
    });
}

function startTransaction() {
    document.getElementById('qr-container').classList.add('active'); 
    document.getElementById('reveal-btn').classList.add('hidden');
    startTimerUI();
    
    const statusMsg = document.getElementById("status-message");
    statusMsg.innerText = "WAITING FOR PAYMENT...";
    setTimeout(() => {
        statusMsg.classList.add('scanning');
        statusMsg.innerText = "WAITING FOR PAYMENT..."; 
        pollingInterval = setInterval(pollAPI, 2000);
    }, 10000); 
}

function pulseTimer() {
    const btn = document.querySelector('.timer-button');
    btn.classList.remove('pulse-anim');
    void btn.offsetWidth; 
    btn.classList.add('pulse-anim');
}

function startTimerUI() {
    const display = document.getElementById("timer-display");
    countdownInterval = setInterval(() => {
        timeRemaining--;
        let minutes = Math.floor(timeRemaining / 60);
        let seconds = timeRemaining % 60;
        display.innerText = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        if (timeRemaining <= 0) triggerFail("Payment Request Timed Out");
    }, 1000);
}

async function pollAPI() {
    pollAttempts++;
    if (pollAttempts > maxAttempts) return triggerFail("Payment Request Timed Out");
    try {
        const response = await fetch(`${API_BASE_URL}/v1/payments?amount=${PAYMENT_AMOUNT}`);
        const data = await response.json();
        if (data.status === "success") triggerSuccess(data);
    } catch (error) { console.error("API Snipe Error:", error); }
}

function triggerSuccess(data) {
    clearInterval(countdownInterval); clearInterval(pollingInterval);
    sessionStorage.removeItem(`active_txn_${TXN_ID}`); 

    document.getElementById("step-pay").style.display = "none";
    document.getElementById("footer-ui").style.display = "none";
    document.getElementById("step-success").style.display = "block";
    document.getElementById("receipt-data").innerHTML = `
        <p>Paid by <span>${data.name || 'Verified User'}</span></p>
        <p>Amount <span style="color: var(--success);">₹${data.amount}</span></p>
        <p>UTR Number <span style="font-family: monospace; letter-spacing: 1px;">${data.utr}</span></p>
        <p>Time <span>${new Date(data.time).toLocaleTimeString()}</span></p>
    `;

    // 💀🔥 FIRE S2S WEBHOOK TO MERCHANT
    fetch("https://gateway-test-m689.onrender.com/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txn_id: TXN_ID, status: "success", utr: data.utr })
    }).catch(e => console.error("Webhook failed:", e));

    // 💀🔥 THE HARD REDIRECT (SUCCESS)
    setTimeout(() => {
        window.location.replace(`${REDIRECT_URL}?status=success&txn=${TXN_ID}&utr=${data.utr}`);
    }, 3000); 
}

function triggerFail(reason) {
    clearInterval(countdownInterval); clearInterval(pollingInterval);
    sessionStorage.removeItem(`active_txn_${TXN_ID}`); 

    document.getElementById("step-pay").style.display = "none";
    document.getElementById("footer-ui").style.display = "none";
    document.getElementById("step-fail").style.display = "block";
    
    if(reason) {
        document.querySelector("#step-fail p").innerText = reason;
    }

    const retryBtn = document.querySelector("#step-fail .retry-btn");
    retryBtn.innerText = "Return to Merchant";
    retryBtn.onclick = () => {
        window.location.replace(`${REDIRECT_URL}?status=failed&txn=${TXN_ID}&reason=${encodeURIComponent(reason)}`);
    };

    // 💀🔥 FIRE S2S WEBHOOK TO MERCHANT
    fetch("https://gateway-test-m689.onrender.com/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txn_id: TXN_ID, status: "failed", reason: reason })
    }).catch(e => console.error("Webhook failed:", e));

    // 💀🔥 THE HARD REDIRECT (FAIL)
    setTimeout(() => {
        window.location.replace(`${REDIRECT_URL}?status=failed&txn=${TXN_ID}&reason=${encodeURIComponent(reason)}`);
    }, 4000);
}
