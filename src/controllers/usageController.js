// --- START: DYNAMIC RULE LOGIC (සංශෝධිතයි) ---
const clientEmail = clientData.client.email || trimmedUsername;
const netRule = await getDynamicConnectionDetails(clientEmail); 

let finalSni = "aka.ms"; // Default SNI
let finalNetworkName = "Standard Connection";

if (netRule) {
    finalSni = netRule.sni;
    finalNetworkName = netRule.display_name;
}

// 1. මුලින්ම පවතින template එකෙන් link එක සාදා ගනී
let v2rayLink = v2rayService.generateV2rayLink(clientData.client, clientData.inbound);

if (v2rayLink) {
    // 2. URL එක සහ Fragment (#) කොටස වෙන් කර ගනී
    let [urlPart, fragmentPart] = v2rayLink.split('#');

    // 3. SNI එක ස්වයංක්‍රීයව replace කිරීම (මෙය වඩාත් නිවැරදි regex එකකි)
    if (urlPart.includes('sni=')) {
        urlPart = urlPart.replace(/sni=[^&?#]+/, `sni=${encodeURIComponent(finalSni)}`);
    } else {
        urlPart += (urlPart.includes('?') ? '&' : '?') + `sni=${encodeURIComponent(finalSni)}`;
    }

    // 4. නව නම සමඟ ලින්ක් එක නැවත සකස් කිරීම
    // මෙහිදී Remark එකේ "Family" වැනි වචනයක් තිබේ නම් netRule හරහා ලැබෙන නම මෙහි වැටේ
    v2rayLink = `${urlPart}#${encodeURIComponent(finalNetworkName)}-${clientEmail}`;
}
// --- END: DYNAMIC RULE LOGIC ---

const newPlan = {
    v2rayUsername: clientEmail,
    v2rayLink: v2rayLink,
    networkDisplayName: finalNetworkName,
    planId: detectedPlanId,
    connId: detectedConnId,
    pkg: finalPackage ? finalPackage.name : null,
    activatedAt: new Date().toISOString(),
    orderId: "linked-" + uuidv4(),
};