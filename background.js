
const openPorts = [];

var delay = 0;
var timr  = null;
var color = '#3d96ab';
var text  = '';

//chrome.runtime.onSuspend.addListener(function(){console.log(arguments)})
chrome.runtime.onMessage.addListener(atInit);
chrome.runtime.onConnect.addListener(port => {
	let pix = openPorts.push(port);
	port.onDisconnect.addListener(() => {
		openPorts.splice(pix - 1, pix)
		if (!openPorts.length) {
			clearTimeout(timr);
			chrome.runtime.onMessage.removeListener(atWork);
			chrome.runtime.onMessage.addListener(atInit);
		}
	});
});

chrome.notifications.onClicked.addListener(openTab);

function openTab() {
	text = '';
	chrome.tabs.create({ url: 'https://www.linux.org.ru/notifications' }, () => {
		chrome.browserAction.setBadgeText({ text });
		openPorts.forEach(port => port.postMessage( text ));
	});
}

function atInit(request, sender) {
	if (request.action === 'lorify-ng init') {
		clearTimeout(timr);
		timr = setTimeout(getNotifications, 5e3);
		chrome.runtime.onMessage.removeListener(atInit);
		chrome.runtime.onMessage.addListener(atWork);
	}
}

function atWork(request, sender, sendResponse) {
	if (request.action === 'lorify-ng checkNow') {
		clearTimeout(timr);
		getNotifications();
	} else
	if (text)
		sendResponse('('+ text +')');
}

function getNotifications() {
	const xhr = new XMLHttpRequest;
	xhr.open('GET', 'https://www.linux.org.ru/notifications-count', true);
	xhr.onload = function() {
		switch (this.status) {
			case 403:
				break;
			case 200:
				var notes = '';
				if (this.response != '0') {
					notes = '('+ this.response +')';
					if (text !== this.response) {
						chrome.notifications.create('lorify-ng notification', {
							type    : 'basic',
							title   : 'www.Linux.Org.Ru',
							message : 'Уведомлений: '+ (text = this.response),
							iconUrl : './icons/penguin-64.png'
						});
						delay = 0;
						chrome.browserAction.setBadgeBackgroundColor({ color });
						chrome.browserAction.setBadgeText({ text });
					}
				}
				openPorts.forEach(port => port.postMessage( notes ));
			default:
				clearTimeout(timr);
				timr = setTimeout(getNotifications, delay < 6e4 ? (delay += 12e3) : delay);
		}
	}
	xhr.send(null);
}
