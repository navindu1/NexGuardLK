const API_URL = "/api/admin";

// Check auth on load
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("adminToken");
    if (!token) {
        window.location.href = "/admin-login.html";
    } else {
        fetchStats();
        fetchOrders();
        
        // Add logout listener
        document.getElementById("admin-logout")?.addEventListener("click", () => {
            localStorage.removeItem("adminToken");
            window.location.href = "/admin-login.html";
        });
    }
});

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem("adminToken");
    const headers = { ...options.headers, "Authorization": `Bearer ${token}` };
    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (res.status === 401) {
        localStorage.removeItem("adminToken");
        window.location.href = "/admin-login.html";
        return;
    }
    return res;
}

async function fetchStats() {
    try {
        const res = await apiFetch("/stats");
        if (res.ok) {
            const { stats } = await res.json();
            document.getElementById("pending-orders-count").innerText = stats.pending_orders;
            document.getElementById("active-orders-count").innerText = stats.active_orders;
            document.getElementById("total-users-count").innerText = stats.total_users;
        }
    } catch (err) {
        console.error("Stats error:", err);
    }
}

async function fetchOrders() {
    try {
        const res = await apiFetch("/orders");
        if (res.ok) {
            const { data } = await res.json();
            renderOrders(data);
        }
    } catch (err) {
        console.error("Orders error:", err);
    }
}

function renderOrders(orders) {
    const tbody = document.getElementById("orders-table-body");
    tbody.innerHTML = "";

    orders.forEach(order => {
        // --- FIX: TYPE DISPLAY LOGIC (UPDATED) ---
        let typeBadge = "";
        
        // Priority 1: If it's explicitly marked as a Renewal
        if (order.is_renewal) {
            typeBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Renew</span>`;
            
            // If a specific package is involved (Multi-package), show it below
            if (order.pkg) {
                 typeBadge += `<div class="text-[10px] text-gray-500 mt-1">Pkg: ${order.pkg}</div>`;
            }
        } 
        // Priority 2: If it has an old username but NOT marked as renewal -> Change Plan
        else if (order.old_v2ray_username) {
            typeBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Change</span>`;
        } 
        // Priority 3: New Order
        else {
            typeBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400 border border-green-500/30">New</span>`;
        }
        // -----------------------------------------

        const tr = document.createElement("tr");
        tr.className = "border-b border-white/5 hover:bg-white/5 transition-colors";
        tr.innerHTML = `
            <td class="px-4 py-3 text-white font-mono text-xs">${order.id.slice(0, 8)}...</td>
            <td class="px-4 py-3 text-white">
                <div class="font-medium">${order.username}</div>
                <div class="text-xs text-gray-500">${order.website_username}</div>
            </td>
            <td class="px-4 py-3 text-white text-sm">${order.plan_id}</td>
            <td class="px-4 py-3 text-center">${typeBadge}</td>
            <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}">
                    ${order.status.toUpperCase()}
                </span>
            </td>
            <td class="px-4 py-3 text-center text-xs text-gray-400">
                ${new Date(order.created_at).toLocaleDateString()}
            </td>
            <td class="px-4 py-3 text-right space-x-2">
                <button onclick="viewReceipt('${order.receipt_path}')" class="text-gray-400 hover:text-white transition-colors" title="View Receipt">
                    <i class="fa-solid fa-receipt"></i>
                </button>
                ${order.status === 'pending' ? `
                    <button onclick="approveOrder('${order.id}')" class="text-green-400 hover:text-green-300 transition-colors" title="Approve">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button onclick="rejectOrder('${order.id}')" class="text-red-400 hover:text-red-300 transition-colors" title="Reject">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                ` : ''}
                <button onclick="deleteOrder('${order.id}')" class="text-red-400 hover:text-red-300 transition-colors" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getStatusColor(status) {
    switch (status) {
        case 'pending': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        case 'approved': return 'bg-green-500/20 text-green-400 border border-green-500/30';
        case 'rejected': return 'bg-red-500/20 text-red-400 border border-red-500/30';
        default: return 'bg-gray-500/20 text-gray-400';
    }
}

function viewReceipt(path) {
    if (!path) return alert("No receipt uploaded.");
    window.open(path, '_blank');
}

async function approveOrder(orderId) {
    if (!confirm("Are you sure you want to approve this order?")) return;
    
    // Show loading state implies UI freeze or spinner, for now basic alert logic
    try {
        const res = await apiFetch("/approve-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId })
        });
        
        const result = await res.json();
        if (res.ok) {
            alert("Order Approved Successfully!");
            fetchStats();
            fetchOrders();
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to approve order.");
    }
}

async function rejectOrder(orderId) {
    if (!confirm("Reject this order?")) return;
    
    try {
        const res = await apiFetch("/reject-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId })
        });
        
        if (res.ok) {
            fetchStats();
            fetchOrders();
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteOrder(orderId) {
    if (!confirm("Delete this order history?")) return;
    
    try {
        const res = await apiFetch(`/order/${orderId}`, {
            method: "DELETE"
        });
        
        if (res.ok) {
            fetchStats();
            fetchOrders();
        }
    } catch (err) {
        console.error(err);
    }
}