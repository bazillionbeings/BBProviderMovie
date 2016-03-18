'use strict';

const rp = require('request-promise'),
    config = require('./config');

class MovieInfoProvider {

    static get ontologyClass() {
        return 'MOVIES AND TV';
    }

    static get ontologySubclass() {
        return 'MOVIE AND SERIES';
    }

    static get ontologyAttributes() {
        return ['title', 'cast', 'director', 'genre'];
    }

    execute(attr) {
        return co(function* () {
            if (attr.title) {
                try {
                    let body = yield rp.get({
                        url: `${config.theMovieDBApiURL}search/movie`,
                        qs: { 'api_key': config.apiKey, query: attr.title },
                        json: true
                    });
                    let data = yield this._formatMovieData(body.results);
                    return data;
                } catch (ex) {
                    throw 'API_ERROR';
                }                
            } else if (attr.cast) {                
                this._searchPerson(attr.cast).then(personId => {
                    rp.get({
                        url: `${config.theMovieDBApiURL}discover/movie`,
                        json: true,
                        qs: { 'api_key': config.apiKey, 'with_cast': personId },
                    }).then(body => {
                        this._formatMovieData(body.results).then(data => {
                            resolve(data);
                        }).catch(error => reject('API_ERROR'));
                    }).catch(error => reject('API_ERROR'));
                }).catch(error => reject('API_ERROR'));
            } else if (attr.director) {
                this._searchPerson(attr.director).then(personId => {
                    rp.get({
                        url: `${config.theMovieDBApiURL}discover/movie`,
                        json: true,
                        qs: { 'api_key': config.apiKey, 'with_crew': personId },
                    }).then(body => {
                        this._formatMovieData(body.results).then(data => {
                            for (let i = 0; i < data.length;) {
                                if (data[i].directors.indexOf(attr.director) === -1) {
                                    data.splice(i, 1);
                                } else {
                                    i++;
                                }
                            }
                            resolve(data);
                        }).catch(error => reject('API_ERROR'));
                    }).catch(error => reject('API_ERROR'));
                }).catch(error => reject('API_ERROR'));
            } else if (attr.genre) {
                rp.get({
                    url: `${config.theMovieDBApiURL}genre/movie/list`,
                    json: true,
                    qs: { 'api_key': config.apiKey }
                }).then(body => {
                    let attrGenre = attr.genre.trim().toLowerCase();
                    body.genres.forEach(genre => {
                        if (genre.name.toLowerCase() === attrGenre) {
                            rp.get({
                                url: `${config.theMovieDBApiURL}genre/${genre.id}/movies?`,
                                json: true,
                                qs: { 'api_key': config.apiKey }
                            }).then(body => {
                                this._formatMovieData(body.results).then(data => {
                                    resolve(data);
                                }).catch(error => reject('API_ERROR'));
                            }).catch(error => reject('API_ERROR'));;
                        }
                    });
                }).catch(error => reject('API_ERROR'));
            }
        });
    }

}

let movieInfo = new MovieInfoProvider();
// movieInfo.execute({ title: 'terminator' }).then(console.log);
//movieInfo.execute({ cast: 'James Cameron' }).then(console.log);
//movieInfo.execute({ director: 'James Cameron' }).then(console.log);
movieInfo.execute({ genre: 'action' }).then(console.log);

module.exports = MovieInfoProvider;