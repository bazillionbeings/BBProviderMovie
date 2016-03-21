'use strict';

const rp = require('request-promise'),
    config = require('./config'),
    co = require('co');

class RpWrapper {
    constructor(rp) {
        this._rp = rp;
        this._REQUESTS_TIME_INTERVAL = 10000;
        this._REQUEST_MAX_COUNT = 30;
        this._requestTimes = [];
    }

    get() {
        let now = Date.now();
        if (this._requestTimes.length === this._REQUEST_MAX_COUNT) {
            let firstRequestTime = this._requestTimes[this._requestTimes.length - 1];            
            let requestTimeDelta = now - firstRequestTime;            
            if (requestTimeDelta < this._REQUESTS_TIME_INTERVAL) {
                let delay = this._REQUESTS_TIME_INTERVAL - requestTimeDelta;
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        this.get.apply(this, arguments).then(resolve).catch(reject);
                    }, delay);
                });
            }
            this._requestTimes.pop();
        }
        this._requestTimes.unshift(now);
        return this._rp.get.apply(this._rp, arguments);        
    }
}

class MovieInfoProvider {
    
    constructor() {
        this._rp = new RpWrapper(rp);
    }

    static get ontologyClass() {
        return 'MOVIES AND TV';
    }

    static get ontologySubclass() {
        return 'MOVIE AND SERIES';
    }

    static get ontologyAttributes() {
        return ['title', 'cast', 'director', 'genre'];
    }

    _formatMovieData(movies) {
        return new Promise((resolve, reject) => {
            let formattedMoviePromises = [];

            movies.forEach((movie, index) => {
                let creditPromise = this._rp.get({
                    url: `${config.theMovieDBApiURL}movie/${movie.id}/credits`,
                    qs: { 'api_key': config.apiKey },
                    json: true
                }).catch(reject);
                let moviePromise = this._rp.get({
                    url: `${config.theMovieDBApiURL}movie/${movie.id}`,
                    qs: { 'api_key': config.apiKey },
                    json: true
                }).catch(reject);
                let formattedMoviePromise = Promise.all([creditPromise, moviePromise]).then(result => {
                    let creditResult = result[0];
                    let movieResult = result[1];
                    let directors = creditResult.crew.filter(crewMember => {
                        return crewMember.job === 'Director';
                    });

                    directors = directors.map(director => {
                        return director.name;
                    });

                    let formattedGenres = movieResult.genres.map(genre => {
                        return genre.name;
                    });

                    let formattedCast = creditResult.cast.map(cast => {
                        return cast.name;
                    });

                    movies[index] = {
                        link: `http://www.imdb.com/title/${movieResult.imdb_id}`,
                        SOURCE: 'themoviedb',
                        MEDIA: 'video',
                        name: movieResult.title,
                        tags: null,
                        filmandbookgenre: formattedGenres,
                        country: null,
                        language: null,
                        subtitle: null,
                        director: directors,
                        cast: formattedCast,
                        movieorseries: 'movie'
                    };
                }).catch(reject);

                formattedMoviePromises.push(formattedMoviePromise);
            });

            Promise.all(formattedMoviePromises).then(() => {
                resolve(movies);
            }).catch(reject);
        });
    }

    _searchPerson(data) {

    }

    execute(attr) {
        return co(function* () {
            if (attr.title) {
                let body = yield this._rp.get({
                    url: `${config.theMovieDBApiURL}search/movie`,
                    qs: { 'api_key': config.apiKey, query: attr.title },
                    json: true
                });                
                let data = yield this._formatMovieData(body.results);
                return data;
            } else if (attr.cast) {
                let personId = yield this._searchPerson(attr.cast);
                let body = yield this._rp.get({
                    url: `${config.theMovieDBApiURL}discover/movie`,
                    json: true,
                    qs: { 'api_key': config.apiKey, 'with_cast': personId },
                });
                return yield this._formatMovieData(body.results);
            } else if (attr.director) {
                let personId = yield this._searchPerson(attr.director);
                let body = this._rp.get({
                    url: `${config.theMovieDBApiURL}discover/movie`,
                    json: true,
                    qs: { 'api_key': config.apiKey, 'with_crew': personId },
                });
                let data = yield this._formatMovieData(body.results);
                for (let i = 0; i < data.length;) {
                    if (data[i].directors.indexOf(attr.director) === -1) {
                        data.splice(i, 1);
                    } else {
                        i++;
                    }
                }
                return data;
            } else if (attr.genre) {
                let body = yield this._rp.get({
                    url: `${config.theMovieDBApiURL}genre/movie/list`,
                    json: true,
                    qs: { 'api_key': config.apiKey }
                });
                let attrGenre = attr.genre.trim().toLowerCase();
                for (let genre of body.genres) {
                    if (genre.name.toLowerCase() === attrGenre) {
                        let body = yield this._rp.get({
                            url: `${config.theMovieDBApiURL}genre/${genre.id}/movies?`,
                            json: true,
                            qs: { 'api_key': config.apiKey }
                        });
                        let data = yield this._formatMovieData(body.results);
                        return data;
                    }
                }
            }
        }.bind(this));
    }

}

let movieInfo = new MovieInfoProvider();
movieInfo.execute({ title: 'Terminator' }).then(console.log).catch(console.error);
// movieInfo.execute({ title: 'Terminator 2: Judgment Day' }).then(console.log).catch(console.error);
//movieInfo.execute({ cast: 'James Cameron' }).then(console.log);
//movieInfo.execute({ director: 'James Cameron' }).then(console.log);
// movieInfo.execute({ genre: 'action' }).then(console.log);

module.exports = MovieInfoProvider;