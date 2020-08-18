const android  = (window.screen.orientation.angle !== 0 || window.screen.orientation.type !== 'landscape-primary');
const settings = new Object;
const defaults = { // default settings
	'Realtime Loader'      : true,
	'CSS3 Animation'       : true,
	'Delay Open Preview'   : 50,
	'Delay Close Preview'  : 800,
	'Desktop Notification' : true,
	'Preloaded Pages Count': 1,
	'Picture Viewer'       : 2,
	'Scroll Top View'      : true,
	'Upload Post Delay'    : 5,
	'Code Block Short Size': 255
};

var notes = 0;

const openPorts = new Array;
const loadStore = typeof browser === 'object' ?
	// load settings
	browser.storage.local.get(defaults) : new Promise(resolve => {
		chrome.storage.local.get(defaults, resolve)
	});
	loadStore.then(items => {
		for (const key in items) {
			settings[key] = items[key];
		}
	});

if ('onSuspend' in chrome.runtime) {
	chrome.runtime.onSuspend.addListener(() => {
		chrome.browserAction.setBadgeBackgroundColor({ color: '#e5be5b' }); //#369e1b
		for (const port of openPorts) {
			port.disconnect();
		}
	});
}

chrome.notifications.onClicked.addListener(openTab.bind(null, android ? '/settings.html' : ''));
chrome.runtime.onConnect.addListener(port => {
	port.onMessage.addListener(messageHandler);
	port.onDisconnect.addListener(discon => {
		openPorts.splice(openPorts.indexOf(discon), 1);
	});
	openPorts.push(port);
	loadStore.then(() => port.postMessage({ name: 'connection-resolve', data: settings }));
});

if ('setBadgeTextColor' in chrome.browserAction) {
	chrome.browserAction.setBadgeTextColor({ color: '#ffffff' });
}
chrome.browserAction.setBadgeBackgroundColor({ color: '#3d96ab' });
chrome.browserAction.getBadgeText({}, label => {
	if (label > 0)
		notes = Number(label);
});
chrome.alarms.onAlarm.addListener(getNotifications);
chrome.alarms.create('check-lor-notifications', {
	when: Date.now() + 1e3
});
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

function openTab(uri) {

	const [ path, cid = '' ] = uri.split('?cid=');

	for (const port of openPorts) {
		if ('tab' in port.sender && port.sender.tab.url.includes(path)) {
			chrome.tabs.update(port.sender.tab.id , { active: true });
			port.postMessage({ name: 'scroll-to-comment', data: cid });
			return;
		}
	}
	chrome.tabs.query({}, tabs => {

		const full_url = { url: (uri !== '/settings.html' ? `https://www.linux.org.ru${uri}` : `${uri}#notifications`), active: true };
		const empty_Rx = new RegExp('^'+
			'about:(?:newtab|blank|home)|'+
			'chrome://(?:newtab|startpage)/?'+ (uri !== '/settings.html' ? 
			'|https?://www.linux.org.ru/?' : '')+
		'$');

		let tab_id = -1, empty_not_found = true;
		for (const { id, url } of tabs) {
			if (url.includes('://www.linux.org.ru'+ path)) {
				tab_id = id;
				break;
			} else if (empty_not_found && empty_Rx.test(url)) {
				tab_id = id;
				empty_not_found = false;
			}
		}
		if (tab_id !== -1) {
			chrome.tabs.update(tab_id, full_url);
		} else {
			chrome.tabs.create(full_url);
		}
	});
}

function messageHandler({ action, data }, port) {
	// check
	switch (action) {
		case 'l0rNG-setts-reset':
			changeSettings(defaults);
			break;
		case 'l0rNG-setts-change':
			changeSettings(data, openPorts.indexOf(port));
			break;
		case 'l0rNG-notes-reset':
			updNoteStatus(0);
			break;
		case 'l0rNG-open-tab':
			openTab(data);
			break;
		case 'l0rNG-reval':
			if ( notes !== data )
				updNoteStatus(data);
		case 'l0rNG-checkNow':
			chrome.alarms.clear('check-lor-notifications');
			getNotifications();
			break;
	}
}

function getNotifications() {

	fetch('https://www.linux.org.ru/notifications-count', {
		credentials: 'same-origin',
		method: 'GET'
	}).then(
		response => {
			if (response.ok) {
				response.json().then( count => {
					if ( notes !== count )
						updNoteStatus(count);
				});
			}
			if (response.status < 400) {
				chrome.alarms.create('check-lor-notifications', {
					delayInMinutes: 1
				});
			} else if (response.status >= 500) {
				chrome.alarms.create('check-lor-notifications', {
					delayInMinutes: 5
				});
			}
		}
	);
}

function updNoteStatus(count) {
	if ( count > notes && settings['Desktop Notification'] ) {
		chrome.notifications.create('lorify-ng', {
			type    : 'basic',
			title   : 'LINUX.ORG.RU',
			message : count +' новых сообщений',
			iconUrl : './icons/penguin-64.png'
		});
	}
	chrome.browserAction.setBadgeText({ text: (notes = count) ? count.toString() : '' });
	openPorts.forEach(port => {
		port.postMessage({ name: 'notes-count-update', data: count })
	});
}
function changeSettings(newSetts, sIdx = -1) {
	for (let i  =  0; i < openPorts.length; i++) {
		if ( i !== sIdx )
			openPorts[i].postMessage({ name: 'settings-change', data: newSetts });
	}
	Object.assign(settings, newSetts);
	chrome.storage.local.set(newSetts);
}
