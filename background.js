
var settings = new Object;
var defaults = { // default settings
	'Realtime Loader'      : true,
	'CSS3 Animation'       : true,
	'Delay Open Preview'   : 50,
	'Delay Close Preview'  : 800,
	'Desktop Notification' : true,
	'Preloaded Pages Count': 1,
	'Scroll Top View'      : true,
	'Upload Post Delay'    : 5,
	'Code Block Short Size': 512
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

var notes = 0;
var timr  = setTimeout(getNotifications, 1e3);

//chrome.runtime.onSuspend.addListener(function(){console.log(arguments)})
chrome.notifications.onClicked.addListener(openTab);
chrome.runtime.onMessage.addListener(messageHandler);
chrome.runtime.onConnect.addListener(port => {
	openPorts.set(port.sender.tab.id, port);
	port.onDisconnect.addListener(() => {
		openPorts.delete(port.sender.tab.id);
	});
});

if (chrome.browserAction.setBadgeTextColor !== undefined) {
	chrome.browserAction.setBadgeTextColor({ color: '#ffffff' });
}
chrome.browserAction.setBadgeBackgroundColor({ color: '#3d96ab' });
/* chrome.webRequest.onBeforeRequest.addListener(
	() => new Object({ cancel: true }),
	{ urls: [
		'*://www.linux.org.ru/js/highlight.pack.js',
		'*://www.linux.org.ru/js/addComments.js',
		'*://www.linux.org.ru/js/realtime.js',
		'*://www.linux.org.ru/js/lor.js*'
	]},
	['blocking']
); */

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
	notes = 0;
	chrome.browserAction.setBadgeText({ text: '' });
	openPorts.forEach(port => port.postMessage(''));
}

function messageHandler({ action }, { tab }) {
	// check
	switch (action) {
		case 'l0rNG-settings':
			openPorts.get(tab.id).postMessage( settings );
			break;
		case 'l0rNG-reset':
			clearNotes();
			break;
		case 'l0rNG-checkNow':
			clearTimeout(timr);
			getNotifications();
			break;
	}
}

function getNotifications() {
	const xhr = new XMLHttpRequest;
	xhr.open('GET', 'https://www.linux.org.ru/notifications-count', true);
	xhr.onload = ({ target: { status, response } }) => {
		if (status === 200 && notes != response) {
			sendNotify( (notes = Number(response)) );
		}
		clearTimeout(timr);
		timr = setTimeout(getNotifications, 40e3);
	}
	xhr.send(null);
}

function sendNotify(count) {
	if (settings['Desktop Notification'] && count) {
		chrome.notifications.create('lorify-ng notification', {
			type    : 'basic',
			title   : 'www.Linux.Org.Ru',
			message : 'Уведомлений: '+ count,
			iconUrl : './icons/penguin-64.png'
		});
	}
	chrome.browserAction.setBadgeText({ text: count ? count.toString() : '' });
	openPorts.forEach(port => port.postMessage( count ? '('+ count +')' : count ));
}
