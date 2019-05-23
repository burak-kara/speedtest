var requests = null;
var pingStatus = "0.0";
var downloadStatus = "0.0";
var uploadStatus = "0.0";
var downloadProgress = 0;
var uploadProgress = 0;
var testPointer = 0;
var interval = null;
var testStatus = -1;

var settings = {
    pingCount: 10,
    ignoreError: 1,
    time_download_min: 5,
    time_download_max: 20,
    time_upload_max: 20,
    time_upload_min: 5,
    time_delay: 5000,
    downloadCount: 5,
    uploadCount: 5,
    testOrder: "P_D_U",
    uploadSize: 20
};

this.addEventListener("message", function (e) {
    var params = e.data.split(" ");
    if (params[0] === "start") doTest();
    else if (params[0] === "status") this.postMessage(JSON.stringify({
        ping: pingStatus,
        download: downloadStatus,
        upload: uploadStatus,
        testState: testStatus
    }));
});

function doTest() {
    if (testStatus === -1) {
        testStatus = 0;
        testPointer = 0;
        var pingRun = false;
        var downloadRun = false;
        var uploadRun = false;
        var runNextTest = function () {
            if (testStatus === 5) return;
            if (testPointer >= settings.testOrder.length) {
                testStatus = 4;
                return;
            }
            switch (settings.testOrder.charAt(testPointer)) {
                case "P": {
                    testPointer++;
                    if (pingRun) {
                        runNextTest();
                        return;
                    } else pingRun = true;
                    testStatus = 1;
                    pingTest(runNextTest);
                }
                    break;
                case "D": {
                    testPointer++;
                    if (downloadRun) {
                        runNextTest();
                        return;
                    } else downloadRun = true;
                    testStatus = 2;
                    downloadTest(runNextTest);
                }
                    break;
                case "U": {
                    testPointer++;
                    if (uploadRun) {
                        runNextTest();
                        return;
                    } else uploadRun = true;
                    testStatus = 3;
                    uploadTest(runNextTest);
                }
                    break;
                case "_": {
                    testPointer++;
                    setTimeout(runNextTest, 1000);
                }
                    break;
                default:
                    testPointer++;
            }
        };
        runNextTest();
    }
}

var isPingCalled = false;

function pingTest(done) {
    if (isPingCalled) return;
    else isPingCalled = true;
    var lastPong = null;
    var ping = 0.0;
    var counter = 0;

    requests = [];
    var doPing = function () {
        lastPong = new Date().getTime();
        requests[0] = new XMLHttpRequest();
        requests[0].onload = function () {
            if (counter === 0)
                lastPong = new Date().getTime();
            else {
                var lastPing = new Date().getTime() - lastPong;
                if (counter === 1) ping = lastPing;
                else ping = lastPing < ping ? lastPing : ping * 0.8 + lastPing * 0.2;
            }
            pingStatus = ping.toFixed(1)/2;
            counter++;
            if (counter < settings.pingCount) doPing();
            else done();
        }.bind(this);
        requests[0].onerror = function () {
            if (settings.ignoreError === 0) {
                pingStatus = "fail";
                clearRequests();
                done();
            } else if (settings.ignoreError === 1) doPing();
            else if (settings.ignoreError === 2) {
                counter++;
                if (counter < settings.pingCount) doPing();
                else done();
            }
        }.bind(this);

        requests[0].open("GET", "http://52.87.200.23:9090/pg" + Math.random(), true); // TODO check for caching
        requests[0].send();
    }.bind(this);
    doPing();
}

var isDownloadCalled = false;

function downloadTest(done) {
    if (isDownloadCalled) return;
    else isDownloadCalled = true;
    var startTime = new Date().getTime();
    var processTime = 0;
    var totalLoaded = 0.0;
    var graceTimeDone = false;
    var isFailed = false;
    requests = [];
    var testStream = function (i, delay) {
        setTimeout(function () {
            if (testStatus !== 2) return;
            var lastLoaded = 0;
            requests[i] = new XMLHttpRequest();

            requests[i].onprogress = function (event) {
                if (testStatus !== 2)
                    try {
                        requests[i].abort();
                    } catch (e) {
                    }
                var loadDiff = event.loaded <= 0 ? 0 : event.loaded - lastLoaded;
                if (isNaN(loadDiff) || !isFinite(loadDiff) || loadDiff < 0) return;
                totalLoaded += loadDiff;
                lastLoaded = event.loaded;
            }.bind(this);
            requests[i].onload = function () {
                try {
                    requests[i].abort();
                } catch (e) {
                }
            }.bind(this);
            requests[i].onerror = function () {
                if (settings.ignoreError === 0) isFailed = true;
                try {
                    requests[i].abort();
                } catch (e) {
                }
                delete requests[i];
            }.bind(this);
            requests[i].open("GET", "http://52.87.200.23:9090/dw" + Math.random(), true);
            requests[i].send();
        }.bind(this), 1 + delay);
    }.bind(this);

    for (var i = 0; i < settings.downloadCount; i++)
        testStream(i, i * settings.time_delay);

    interval = setInterval(function () {
        var time = new Date().getTime() - startTime;
        if (graceTimeDone) downloadProgress = time / (settings.time_download_max * 1000);
        if (time < settings.time_delay) return;
        if (!graceTimeDone) {
            if (time > 1000 * settings.time_download_min) {
                if (totalLoaded > 0) {
                    startTime = new Date().getTime();
                    totalLoaded = 0.0;
                }
                graceTimeDone = true;
            }
        } else {
            var speed = totalLoaded / ((time-processTime) / 1000.0);
            downloadStatus = ((speed * 8) / 100000).toFixed(4);
            if (time / 1000.0 > settings.time_download_max || isFailed) {
                if (isFailed || isNaN(downloadStatus)) downloadStatus = "Fail";
                clearRequests();
                clearInterval(interval);
                downloadProgress = 1;
                done();
            }
        }
    }.bind(this), settings.time_delay);
}

var isUploadCalled = false;

function uploadTest(done) {
    if (isUploadCalled) return;
    else isUploadCalled = true;

    var queryString = "";
    for (var i = 0; i < 10000000; i++) {
        queryString += Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    var totalLoaded = 0.0;
    var graceTimeDone = false;
    var isFailed = false;
    requests = [];
    var startTime = new Date().getTime();
    var testStream = function (i, delay) {
        setTimeout(function () {
            if (testStatus !== 3) return;
            var lastLoaded = 0;
            requests[i] = new XMLHttpRequest();

            requests[i].upload.onprogress = function (event) {
                var loadDiff = event.loaded <= 0 ? 0 : event.loaded - lastLoaded;
                if (isNaN(loadDiff) || !isFinite(loadDiff) || loadDiff < 0) return;
                totalLoaded += loadDiff;
                lastLoaded = event.loaded;
            }.bind(this);

            requests[i].upload.onerror = function () {
                if (settings.ignoreError === 0) isFailed = true;
                try {
                    requests[i].abort();
                } catch (e) {
                }
                delete requests[i];
            }.bind(this);

            requests[i].open("POST", "http://52.87.200.23:9090/up" + Math.random(), true);
            try {
                requests[i].setRequestHeader("Content-Length", "" + (queryString.length + 100));
            } catch (e) {
            }
            try {
                requests[i].setRequestHeader("Content-Type", "application/octet-stream");
            } catch (e) {
            }
            requests[i].send(queryString);

        }.bind(this), 1 + delay);
    }.bind(this);

    for (var i = 0; i < settings.uploadCount; i++) {
        testStream(i, settings.time_delay * i);
    }

    interval = setInterval(function () {
        var time = new Date().getTime() - startTime;
        if (graceTimeDone) uploadProgress = time / (settings.time_upload_max * 1000);
        if (time < settings.time_delay) return;
        if (!graceTimeDone) {
            if (time > 1000 * settings.time_upload_min) {
                if (totalLoaded > 0) {
                    startTime = new Date().getTime();
                    totalLoaded = 0.0;
                }
                graceTimeDone = true;
            }
        } else {
            var speed = totalLoaded / (time / 1000.0);
            uploadStatus = ((speed * 8) / 100000).toFixed(4);
            if (time / 1000.0 > settings.time_upload_max || isFailed) {
                if (isFailed || isNaN(uploadStatus)) uploadStatus = "Fail";
                clearRequests();
                clearInterval(interval);
                uploadProgress = 1;
                done();
            }
        }
    }, settings.time_delay);
}

function clearRequests() {
    if (requests) {
        for (var i = 0; i < requests.length; i++) {
            try {
                requests[i].onprogress = null;
                requests[i].onload = null;
                requests[i].onerror = null;
            } catch (e) {
            }
            try {
                requests[i].upload.onprogress = null;
                requests[i].upload.onload = null;
                requests[i].upload.onerror = null;
            } catch (e) {
            }
            try {
                requests[i].abort();
            } catch (e) {
            }
            try {
                delete requests[i];
            } catch (e) {
            }
        }
        requests = null;
    }
}