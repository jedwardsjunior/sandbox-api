// Add query
var https = require('https');
var http = require('http');

var config_db = require('../config/db.js');
var config_api = require('../config/api.js');
var db = require('orchestrate')(config_db.db);

var scraper = require('google-scraper');
var parseString = require('xml2js').parseString;

var WOLFRAM_KEY = config_api.wolfram;
var FB_ACCESS_TOKEN = config_api.facebook_app_id+"|"+config_api.facebook_app_secret;

var fb_ready = false;
var google_ready = false;
var wolfram_ready = false;
var dictionary_of_data = {};


function getFBResults(query, callback) {
		var url = "https://graph.facebook.com/search?q="+query+
							"& type=page& fields=likes,name,picture& access_token="+FB_ACCESS_TOKEN;
		var body = '';
		https.get(url, function(res) {
			res.on("data", function(data) {
				body += data;
  		});
			res.on('end', function () {
				callback(body);
  		});
		}).on('error', function(e) {
  		console.log("Got error: " + e.message);
			callback(null);
	});

}

/**
function getProfilePicture(page, callback) {
	var url = "https://graph.facebook.com/"+page.id+"/picture?redirect=0";
	var body = "";
	https.get(url, function(res) {
		res.on("data", function(data) {
			body += data;
		});
		res.on('end', function () {
			page.picture = JSON.parse(body).data;
			callback(page);
		});
	}).on('error', function(e) {
		console.log("Got error: " + e.message);
		callback(page);
	});
}
*/

function getGoogleResults(query, callback) {
	var options = {
		keyword : query,
		language : "en",
		results : 100
	};

	var scrape = new scraper.GoogleScraper(options);

	scrape.getGoogleLinks(function(arrayLink){
		callback(arrayLink);
	});
};

function getWolframAlphaResults(query, callback) {
	var url = "http://api.wolframalpha.com/v2/query?input="+query+"&appid="+
						WOLFRAM_KEY;
	var body = '';
	http.get(url, function(res) {
		res.on("data", function(data) {
			body += data;
		});
		res.on('end', function () {
			callback(body);
		});
	}).on('error', function(e) {
		console.log("Got error: " + e.message);
		callback(null);
	});
};


function addFBDataToDB(data) {
	dictionary_of_data.FB = data;
};

function addGoogleDataToDB(data) {
	dictionary_of_data.Google = data;
}

function addWolframDataToDB(data) {
	dictionary_of_data.Wolfram = data;
}

function addDataToDB(query) {
	console.log(dictionary_of_data);
	db.put('Queries', query, dictionary_of_data);
}

exports.addQuery = function (query) {
	// --- Pre-Check for Existing Data ---

	var exists = false;

	db.get('Queries', query)
	.then(function (result) {
		// If the query is already in the DB, don't grab the info again
		console.log("Existing query!");
		exists = true;
	})
	.fail(function (err) {
		console.log("New query!");
	});

	if (!exists) {
		// --- GOOGLE INFO ---
		getGoogleResults(query, function(result) {
			var google_links = result;
			addGoogleDataToDB(google_links);
			google_ready = true;
		});

		// --- FACEBOOK INFO ---
		getFBResults(query, function(result) {
			if(result) {
				var fb_top_five = [];
				var data = JSON.parse(result).data;
				for (i=0; i<5; i++) {
					/**data[i].picture = getProfilePicture(data[i], function(result) {
					console.log(result);
					fb_top_five.push(result);*/
					fb_top_five.push(data[i]);

					if(fb_top_five.length == 5) {
						addFBDataToDB(fb_top_five);
						fb_ready = true;
					}

					//});
				}
			}
		});


		// --- WOLFRAM ALPHA INFO ---
		getWolframAlphaResults(query, function(result) {
			var xml = result;
			parseString(xml, function (err, res) {
				console.log("RESULT = ",res);
				addWolframDataToDB(res);
				wolfram_ready = true;
			});
		});


		function wait() {
			if(fb_ready && google_ready && wolfram_ready) {
				//console.log("Done!");
				addDataToDB(query);
			} else {
				//console.log("I'm waiting...");
				setTimeout(wait, 300);
			}
		}

		wait();

	};
};
