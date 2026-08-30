
// Toast Notification System
function showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.bottom = '80px';
        toastContainer.style.left = '50%';
        toastContainer.style.transform = 'translateX(-50%)';
        toastContainer.style.zIndex = '9999';
        toastContainer.style.display = 'flex';
        toastContainer.style.flexDirection = 'column';
        toastContainer.style.gap = '10px';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.background = type === 'error' || type === 'danger' ? 'rgba(255, 50, 50, 0.9)' : 
                             type === 'success' ? 'rgba(0, 255, 136, 0.9)' : 'rgba(30, 30, 40, 0.9)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = 'bold';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.textAlign = 'center';
    
    toastContainer.appendChild(toast);
    
    // Trigger reflow and fade in
    setTimeout(() => { toast.style.opacity = '1'; }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}
