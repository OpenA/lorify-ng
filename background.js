
var settings = new Object;
var defaults = { // default settings
	'Realtime Loader'      : true,
	'CSS3 Animation'       : true,
	'Delay Open Preview'   : 50,
	'Delay Close Preview'  : 800,
	'Desktop Notification' : true,
	'Preloaded Pages Count': 1
};
// load settings
chrome.storage.onChanged.addListener(items => {
	for (let name in items) {
		settings[name] = items[name].newValue;
	}
});
chrome.storage.sync.get(defaults, items => {
	for (let name in items) {
		settings[name] = items[name];
	}
});

const openPorts = new Map;
const empty_Url = [
	'about:newtab',
	'about:blank',
	'about:home',
	'chrome://startpage/',
	'chrome://newtab/'
];

var start = true;
var delay = 0;
var timr  = null;
var color = '#3d96ab';
var text  = '';

//chrome.runtime.onSuspend.addListener(function(){console.log(arguments)})
chrome.notifications.onClicked.addListener(openTab);
chrome.runtime.onMessage.addListener(messageHandler);
chrome.runtime.onConnect.addListener(port => {
	openPorts.set(port.sender.tab.id, port);
	port.onDisconnect.addListener(() => {
		openPorts.delete(port.sender.tab.id);
		if (!openPorts.size) {
			clearTimeout(timr);
		}
	});
});

function onGetTabs(tabs) {
	// If exists a tab with URL == `notify_Url` then we switches to this tab.
	var tab = tabs[0];
	if (tab) {
		chrome.tabs.reload(tab.id);
		chrome.tabs.update(tab.id, { active: true }, clearNotes);
	} else {
		chrome.tabs.query({}, onGetAllTabs);
	}
}
function onGetAllTabs(tabs) {
	/// If opened a new tab (or the start page) then we goes to the `notify_Url`.
	for (let tab of tabs) {
		if (empty_Url.includes(tab.url)) {
			chrome.tabs.update(tab.id, { url: 'https://www.linux.org.ru/notifications', active: true }, clearNotes);
			return;
		}
	}
	chrome.tabs.create({ url: 'https://www.linux.org.ru/notifications' }, clearNotes);
}
function openTab() {
	chrome.tabs.query({ url: '*://www.linux.org.ru/notifications' }, onGetTabs);
}
function clearNotes() {
	text = '';
	chrome.browserAction.setBadgeText({ text });
	openPorts.forEach(port => port.postMessage( text ));
}

function messageHandler({ action, notes }, sender) {
	// check
	switch (action) {
		case 'l0rNG-settings':
			openPorts.get(sender.tab.id).postMessage( settings );
			break;
		case 'l0rNG-checkNow':
			clearTimeout(timr);
			getNotifications();
			break;
		case 'l0rNG-init':
			if (text !== notes) {
				!notes ? clearNotes() : sendNotify( '('+ (text = notes) +')' );
			}
			if (start) {
				clearTimeout(timr);
				timr  = setTimeout(getNotifications, 5e3);
				start = false;
			}
	}
}

function getNotifications() {
	const xhr = new XMLHttpRequest;
	xhr.open('GET', 'https://www.linux.org.ru/notifications-count', true);
	xhr.onload = function() {
		switch (this.status) {
			case 403:
				break;
			case 200:
				if (this.response != '0' && text !== this.response) {
					sendNotify( '('+ (text = this.response) +')' );
					delay = 0;
				} else
					clearNotes();
			default:
				clearTimeout(timr);
				timr = setTimeout(getNotifications, delay < 6e4 ? (delay += 12e3) : delay);
		}
	}
	xhr.send(null);
}

function sendNotify(notes) {
	if (settings['Desktop Notification']) {
		chrome.notifications.create('lorify-ng notification', {
			type    : 'basic',
			title   : 'www.Linux.Org.Ru',
			message : 'Уведомлений: '+ text,
			iconUrl : './icons/penguin-64.png'
		});
	}
	chrome.browserAction.setBadgeBackgroundColor({ color });
	chrome.browserAction.setBadgeText({ text });
	openPorts.forEach(port => port.postMessage( notes ));
}
