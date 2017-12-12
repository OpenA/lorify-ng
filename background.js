
const openPorts = [];

var notes, timr, delay = 0;

chrome.runtime.onSuspend.addListener(function(){console.log(arguments)})

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

chrome.notifications.onClicked.addListener(function() {
	chrome.tabs.create({ url: 'https://www.linux.org.ru/notifications' }, function() {
		openPorts.forEach(port => chrome.browserAction.setBadgeText({ text : '', tabId: port.sender.tab.id }));
	});
});

function atInit(request, sender) {
	if (request.action === 'lorify-ng init') {
		clearTimeout(timr);
		timr = setTimeout(getNotifications, 2e3);
		chrome.runtime.onMessage.removeListener(atInit);
		chrome.runtime.onMessage.addListener(atWork);
	}
}

function atWork(request, sender, sendResponse) {
	if (request.action === 'lorify-ng checkNow') {
		clearTimeout(timr);
		getNotifications();
	} else
	if (notes)
		sendResponse(notes);
}

function getNotifications() {
	const xhr = new XMLHttpRequest;
	xhr.open('GET', 'https://www.linux.org.ru/notifications-count', true);
	xhr.onload = function() {
		switch (this.status) {
			case 403:
				break;
			case 200:
				var text = '';
				if (this.response != '0') {
					text = '('+ this.response +')';
					if (notes !== this.response) {
						chrome.notifications.create('lorify-ng notification', {
							type    : 'basic',
							title   : 'www.Linux.Org.Ru',
							message : 'Уведомлений: '+ (notes = this.response),
							iconUrl : './icons/penguin-64.png'
						});
						delay = 0;
					}
				}
				openPorts.forEach(port => {
					chrome.browserAction.setBadgeBackgroundColor({
						color: '#3d96ab',
						tabId: port.sender.tab.id
					});
					chrome.browserAction.setBadgeText({ text, tabId: port.sender.tab.id })
					port.postMessage(text);
				});
			default:
				clearTimeout(timr);
				timr = setTimeout(getNotifications, delay < 6e4 ? (delay += 12e3) : delay);
		}
	}
	xhr.send(null);
}
