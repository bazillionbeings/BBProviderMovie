'use strict';

const rp = require('request-promise'),
    config = require('./config');

class RpWrapper {
    constructor(rp) {
        this._rp = rp;
        this._REQUESTS_TIME_INTERVAL = 11000;
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
        return 'MovieAndTv';
    }

    static get ontologySubclass() {
        return 'MovieAndSeries';
    }

    static get ontologyAttributes() {
        return ['name', 'cast', 'director', 'genre'];
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
                        class: MovieInfoProvider.ontologyClass,
                        subclass: MovieInfoProvider.ontologySubclass,
                        id: movieResult.id,
                        url: `http://www.imdb.com/title/${movieResult.imdb_id}`,
                        webUrl: `http://www.imdb.com/title/${movieResult.imdb_id}`,
                        source: 'themoviedb',
                        type: 'video',
                        name: movieResult.title,
                        tags: [],
                        attributes: {
                            filmandbookgenre: formattedGenres,
                            director: directors,
                            cast: formattedCast,
                            movieorseries: 'movie'
                        }
                    };
                    if (movies[index].backgroundImageUrl) {
                        movies[index].backgroundImageUrl = `http://image.tmdb.org/t/p/w780${movieResult.poster_path}`;
                    }
                }).catch(reject);

                formattedMoviePromises.push(formattedMoviePromise);
            });

            Promise.all(formattedMoviePromises).then(() => {
                resolve(movies);
            }, reject).catch(reject);
        });
    }

    _searchPerson(name) {
        return new Promise((resolve, reject) => {
            rp.get({
                url: `${config.theMovieDBApiURL}search/person`,
                qs: { 'api_key': config.apiKey, query: name },
                json: true
            }).then(result => {
                if (result.results && result.results.length > 0) {
                    resolve(result.results[0].id);
                } else {
                    resolve(null);
                }
            }).catch(reject);
        });
    }

    _searchByTitle(title) {
        return new Promise((resolve, reject) => {
            this._rp.get({
                url: `${config.theMovieDBApiURL}search/movie`,
                qs: { 'api_key': config.apiKey, query: title },
                json: true
            }).then(body => {
                let results = body.results;
                //filter for title result only
                for (let i = 0; i < results.length;) {
                    if (results[i].original_title.toLowerCase().indexOf(title.toLowerCase()) === -1) {
                        results.splice(i, 1);
                    } else {
                        i++;
                    }
                }
                this._formatMovieData(results).then(resolve).catch(reject);
            }).catch(reject);
        });
    }

    _searchByCast(name) {
        return new Promise((resolve, reject) => {
            this._searchPerson(name).then(personId => {
                let body = this._rp.get({
                    url: `${config.theMovieDBApiURL}discover/movie`,
                    json: true,
                    qs: { 'api_key': config.apiKey, 'with_cast': personId },
                }).then(body => {
                    this._formatMovieData(body.results).then(resolve).catch(reject);
                }).catch(reject);             
            }).catch(reject);
        });
    }

    _searchByDirector(directorName) {
        return new Promise((resolve, reject) => {
            let personId = this._searchPerson(directorName).then(personId => {
                this._rp.get({
                    url: `${config.theMovieDBApiURL}discover/movie`,
                    json: true,
                    qs: { 'api_key': config.apiKey, 'with_crew': personId },
                }).then(body => {
                    this._formatMovieData(body.results).then(data => {
                        for (let i = 0; i < data.length;) {
                            if (data[i].attributes.director.indexOf(directorName) === -1) {
                                data.splice(i, 1);
                            } else {
                                i++;
                            }
                        }
                        resolve(data);
                    }).catch(reject);
                }).catch(reject);
            });
        });
    }

    _searchByGenre(genre) {
        return new Promise((resolve, reject) => {
            this._rp.get({
                url: `${config.theMovieDBApiURL}genre/movie/list`,
                json: true,
                qs: { 'api_key': config.apiKey }
            }).then(body => {
                let attrGenre = genre.trim().toLowerCase();
                for (let genre of body.genres) {
                    if (genre.name.toLowerCase() === attrGenre) {
                        this._rp.get({
                            url: `${config.theMovieDBApiURL}genre/${genre.id}/movies?`,
                            json: true,
                            qs: { 'api_key': config.apiKey }
                        }).then(body => {
                            this._formatMovieData(body.results).then(data => {
                                resolve(data);
                            }).catch(reject);
                        }).catch(reject);                        
                    }
                }
            }).catch(reject);            
        });
    }

    execute(input, limit) {
        let resultPromises = [];
        let promise;
        let result = [];
        let outputPromises = [];
        for (let attrs of input) {
            let attrPromises = [];
            for (let attrKey in attrs) {
                if (attrKey === 'name') {
                    promise = this._searchByTitle(attrs[attrKey]);
                    attrPromises.push(promise);
                } else if (attrKey === 'cast') {
                    promise = this._searchByCast(attrs[attrKey]);
                    attrPromises.push(promise);
                } else if (attrKey === 'director') {
                    promise = this._searchByDirector(attrs[attrKey]);
                    attrPromises.push(promise);
                } else if (attrKey === 'genre') {
                    promise = this._searchByGenre(attrs[attrKey]);
                    attrPromises.push(promise);
                }
            }
            //AND
            let outputPromise = new Promise((resolve, reject) => {
                Promise.all(attrPromises).then(result => {
                    let endResult = null;
                    if (result.length > 1) {
                        endResult = result.reduce((prev, current) => {
                            let output = [];
                            for (let currentItem of current) {
                                let found = false;
                                for (let prevItem of prev) {
                                    if (currentItem.id === prevItem.id) {
                                        output.push(currentItem);
                                        break;
                                    }
                                }
                            }
                            return output;
                        });                        
                    } else if (result.length > 0) {
                        endResult = result[0];
                    }
                    resolve(endResult);
                }, reject).catch(reject);
            });
            outputPromises.push(outputPromise);
        }

        //OR
        return new Promise((resolve, reject) => {
            Promise.all(outputPromises).then(andResults => {
                let output = [];
                for (let andResult of andResults) {
                    for (let andResultItem of andResult) {
                        let found = false;
                        for (let outputItem of output) {
                            if (outputItem.id === andResultItem.id) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            output.push(andResultItem);
                        }
                    }
                }
                output = output.map(item => {
                    delete item.id;
                    return item;
                });
                resolve(output);
            }, reject).catch(reject);
        });

    }

}

let movieInfo = new MovieInfoProvider();
movieInfo.execute([{ name: 'Terminator' }]).then(result => console.dir(result, {depth: null})).catch(console.error);
// movieInfo.execute([{ name: 'Terminator 2: Judgment Day' }]).then(console.log).catch(console.error);
// movieInfo.execute([{ director: 'James Cameron', name: 'Terminator' }, {title: 'Titanic'}]).then(console.log).catch(error => {    
//     if (error.stack) console.error(error.stack);
//     else console.error(error);
// });
//movieInfo.execute({ director: 'James Cameron' }).then(console.log);
// movieInfo.execute({ genre: 'action' }).then(console.log);

module.exports = MovieInfoProvider;