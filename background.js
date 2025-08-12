/* lorify-ng background script */
const defaults = Object.freeze({ // default settings
	'Realtime Loader'      : true,
	'CSS3 Animation'       : true,
	'Delay Open Preview'   : 50,
	'Delay Close Preview'  : 800,
	'Desktop Notification' : 1,
	'Сlear Notifications'  : true,
	'Preloaded Pages Count': 1,
	'Picture Viewer'       : 2,
	'Markup Mode'          : 0,
	'Save Topic Pos'       : false,
	'Scroll Top View'      : true,
	'Upload Post Delay'    : 3,
	'Code Block Short Size': 15,
	'Code Highlight Style' : 0
});

let notes = 0, notif_mode = 1,
    value = 0, need_login = false;

const openPorts = new Set;
const isFirefox = navigator.userAgent.includes('Firefox');

if (typeof browser === 'undefined')
	var browser = chrome;

// load settings
browser.storage.local.get().then(setNotifCheck);
chrome.notifications.onClicked.addListener(() => {
	const ismob = notif_mode === 2;
	openTab(`${ ismob ? '#' : 'lor://' }notifications`,
	            ismob ? 'notes-show' : 'rel');
});
chrome.runtime.onConnect.addListener(port => {
	if (port.name === 'lory-wss') {
		chrome.alarms.clear('T-chk-notes');
	}
	port.onMessage.addListener(messageHandler);
	port.onDisconnect.addListener(() => {
		openPorts.delete(port);
		for(const p of openPorts) {
			if (p.name === 'lory-wss')
				return;
		}
		if (notif_mode > 0) {
			chrome.alarms.create('T-chk-notes', {
				when: Date.now() + 5e4, periodInMinutes: 5 });
		}
	});
	openPorts.add(port);
	port.postMessage({ action: 'connection-resolve', data: defaults });
	if (port.name === 'lory-menu')
		port.postMessage({ action: 'notes-count-update', data: notes });
});

const setBadge = chrome.browserAction && chrome.browserAction.setBadgeText ? (
	badge => {
		if ('setBadgeTextColor' in badge) {
			badge.setBadgeTextColor({ color: '#ffffff' });
		}
		badge.setBadgeBackgroundColor({ color: '#3d96ab' });
		badge.getBadgeText({}, label => {
			if (label > 0)
				notes = Number(label);
		});
		return opts => {
			if ('text'  in opts) badge.setBadgeText(opts); else
			if ('color' in opts) badge.setBadgeBackgroundColor(opts);
		}
	}
)(chrome.browserAction) : () => void 0;

chrome.alarms.onAlarm.addListener(getNotifications);

function setNotifCheck(items, has_wss = false) {
	if ('Desktop Notification' in items)
		notif_mode = items['Desktop Notification'];
	if (!has_wss && notif_mode > 0)
		chrome.alarms.create('T-chk-notes', {
			when: Date.now() + 4e3, periodInMinutes: 4 });
}

const queryScheme = isFirefox
   ? url => browser.tabs.query({ url })
   : url => new Promise(res => void chrome.tabs.query({ url }, res))

const matchEmptyOr = (tabs, m_uri = '', m_rx = '') => new Promise(resolve => {

	const empty_Rx = new RegExp(m_rx ? m_rx : '^'+ 
		(isFirefox ? 'about:(?:newtab|home)$' : 'chrome://.*(?:newtab|startpage)') +
	'');

	let tab_id = -1;
	for (const { id, url } of tabs) {
		if (m_uri && url.includes(m_uri)) {
			tab_id = id;
			break;
		} else if (empty_Rx.test(url))
			tab_id = id;
	}
	resolve(tab_id);
});

function openTab(uri = '', action = '') {

	let schi = uri.search(/\?|\#/);
	if (schi === -1)
	    schi = uri.length;

	const lor = uri.startsWith('lor:/') ? 5 : 0,
	     path = uri.substring(lor, schi),
	     orig = lor ? '://www.linux.org.ru'+ path : chrome.runtime.getURL('/settings.html'),
	     href = lor ? 'https' + orig + uri.substring(schi) : orig + uri;

	for (const port of openPorts) {
		const { url, id } = port.sender.tab || '';
		if (url && url.includes(orig)) {
			chrome.tabs.update(id, { active: true });
			if (action === 'rel') {
				chrome.tabs.reload(id);
			} else
				port.postMessage({ action, data: uri.substring(lor) });
			return;
		}
	}
	const fin = tab_id => {
		if (tab_id !== -1 ) {
			chrome.tabs.update(tab_id, { active: true, url: href });
			chrome.tabs.reload(tab_id);
		} else
			chrome.tabs.create({ active: true, url: href });
	}
	if (lor) {
		queryScheme(['*://www.linux.org.ru/', '*'+ orig +'*']).then(
			tabs => matchEmptyOr(tabs, orig, '^https?://www.linux.org.ru/?$')
		).then(lor_id => {
			if(lor_id !== -1) {
				fin(lor_id);
			} else
			 	queryScheme().then(matchEmptyOr).then(fin);
		});
	} else {
		queryScheme().then(tabs => matchEmptyOr(tabs, orig)).then(fin);
	}
}

function messageHandler({ action, data }, port) {
	// check
	switch (action) {
		case 'reset-all':
			changeSettings(defaults);
			break;
		case 'upd-setts':
			changeSettings(data, port);
			break;
		case 'chk-notes':
			chrome.alarms.clear('Q-chk-notes');
			chrome.alarms.create('Q-chk-notes', {
				when: Date.now() + 1e3
			});
			break;
		case 'open-tab':
			openTab(data, 'scroll-to-comment');
			break;
		case 'set-notes':
			if ( notes < data || notes > data ) {
				chrome.alarms.clear('Q-chk-notes');
				updNoteStatus(data, port);
			}
			break;
		case 'extra-params':
			// no extra params
	}
}

function getNotifications(alm) {

	fetch('https://www.linux.org.ru/notifications-count', {
		credentials: 'same-origin',
		method: 'GET'
	}).then(
		response => {
			if (response.ok) {
				response.json().then( count => {
					if ( notes < count || notes > count )
						updNoteStatus(count);
				});
			} else if (response.status === 403) {
				chrome.alarms.clearAll();
				need_login = true;
			}
		}
	);
}

function updNoteStatus(count = 0, ex_port = null) {
	if ( count > notes && notif_mode > 0 ) {
		chrome.notifications.create('lorify-ng', {
			type    : 'basic',
			title   : 'LINUX.ORG.RU',
			message : count +' новых сообщений',
			iconUrl : 'icons/penguin-mono.svg'
		});
	}
	setBadge({ text: (notes = count) ? count.toString() : '' });
	for (const port of openPorts) {
		if (port !== ex_port )
			port.postMessage({ action: 'notes-count-update', data: count });
	}
}
function changeSettings(newSetts, ex_port = null) {
	let hasWss = false;
	for (const port of openPorts) {
		if (port.name === 'lory-wss')
			hasWss = true;
		if (port !== ex_port )
			port.postMessage({ action: 'settings-change', data: newSetts });
	}
	setNotifCheck(newSetts, hasWss);
	browser.storage.local.set(newSetts);
}
