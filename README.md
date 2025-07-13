## Расширение для сайта [linux.org.ru](https://www.linux.org.ru/)
Это форк проекта [lorify](https://bitbucket.org/b0r3d0m/lorify) использующий новые возможности движка форума такие как WebSocket.
Является полностью универсальным, можно использовать и всё расширение целиком и отдельный юзерскрипт.

![lorify logo](https://github.com/OpenA/lorify-ng/blob/master/icons/loriko.svg?raw=true)|<img src="https://i.imgur.com/Zjp8CYv.png">
------------ | -------------

### Сборка и тестирование расширения
По умолчанию расширение поддерживает manifest-v3 для легкой эксплуатации в браузере Chromium.

Что бы переключиться на manifest-v2 для тестирования в Firefox,
необходимо выполнить в терминале следующее:

    cd /path/to/lorify-ng
    git checkout manifest_v2

Если нужно обратно:

    git checkout manifest_v3

Для упаковки расширения Firefox

    mkdir dist
    zip -T dist/lorify-ng.xpi lorify-ng.user.js settings.html settings.js background.js content_script.js manifest.json LICENSE icons/*

В Chromium (для своих расширений) есть встроенная функция упаковки.
