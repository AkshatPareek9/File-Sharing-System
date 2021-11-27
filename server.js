//create server
const express = require("express");
const app = express();
var http = require("http").createServer(app);

//database storage
var mongodb = require("mongodb");
var ObjectId = mongodb.ObjectId;
var mongoClient = mongodb.MongoClient;

//url for starting the server
var mainURL = "http://localhost:3000/";
var database = null;

//for create home page
app.use("/public", express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.use(express.json());

// to do the login and registration
var expressSession = require("express-session");
app.use(expressSession({
    "key": "user_id",
    "secret": "User secret object ID",
    "resave": true,
    "saveUninitialized": true
}));

//body parser module to get form fields in node js
var bodyParser = require("body-parser");
app.use(bodyParser.json({ limit: "10000mb" }));
app.use(bodyParser.urlencoded({
    extended: true,
    limit: "10000mb",
    parameterLimit: 1000000
}));

//brcypt module to convert plain password into encrypted string
var bcrypt = require("bcrypt");

//formidabel and fs module 
//to save files in nodejs server directory
var formidable = require("formidable");
var fileSystem = require("fs");

//get user from database
function getUser(userId, callBack) {
    database.collection("users").findOne({
        "_id": ObjectId(userId)
    }, function(error, result) {
        if (error) {
            console.log(error);
            return;
        }
        if (callBack != null) {
            callBack(result);
        }
    });
}

//start the server
http.listen(process.env.PORT || 3000, function() {
    console.log("Connected");

    //connect to database
    mongoClient.connect("mongodb://localhost:27017", { useUnifiedTopology: true },
        function(error, client) {
            if (error) {
                console.log(error);
                return;
            }
            //database name = image_sharing_app
            database = client.db("image_sharing_app");

            app.get("/", function(request, result) {

                // view uploaded pictures
                database.collection("images").find().sort({
                    "createdAt": -1
                }).toArray(function(error1, images) {

                    if (request.session.user_id) {
                        getUser(request.session.user_id, function(user) {
                            result.render("index", {
                                "isLogin": true,
                                "query": request.query,
                                "user": user,
                                "images": images
                            });
                        });
                    } else {
                        result.render("index", {
                            "isLogin": false,
                            "query": request.query,
                            "images": images
                        });
                    }

                });

            });

            app.get("/register", function(request, result) {
                result.render("register", {
                    "query": request.query
                });
            });

            app.post("/register", function(request, result) {
                if (request.body.password != request.body.confirm_password) {
                    result.redirect("/register?error=mismatch");
                    return;
                }

                database.collection("users").findOne({
                    "email": request.body.email
                }, function(error1, user) {
                    if (user == null) {
                        bcrypt.hash(request.body.password, 10, function(error3, hash) {
                            database.collection("users").insertOne({
                                "name": request.body.name,
                                "email": request.body.email,
                                "password": hash
                            }, function(error2, data) {
                                result.redirect("/login?message=registered");
                            });
                        });
                    } else {
                        result.redirect("/register?error=exists");
                    }
                });
            });

            //login
            app.get("/login", function(request, result) {
                result.render("login", {
                    "query": request.query
                });
            });

            //handle login request
            app.post("/login", function(request, result) {
                var email = request.body.email;
                var password = request.body.password;

                database.collection("users").findOne({
                    "email": email
                }, function(error1, user) {
                    if (user == null) {
                        result.redirect("/login?error=not_exists");
                    } else {
                        bcrypt.compare(password, user.password, function(
                            error2, isPasswordVerify) {
                            if (isPasswordVerify) {
                                request.session.user_id = user._id;
                                result.redirect("/");
                            } else {
                                result.redirect("/login?error=wrong_password");
                            }
                        });
                    }
                });
            });

            //handle logout request
            app.get("/logout", function(request, result) {
                request.session.destroy();
                result.redirect("/");
            });

            //user uploaded pictures
            app.get("/my_uploads", function(request, result) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, function(user) {
                        database.collection("images").find({
                            "user._id": ObjectId(request.session.user_id)
                        }).sort({
                            "createdAt": -1
                        }).toArray(function(error1, images) {
                            result.render("index", {
                                "isLogin": true,
                                "query": request.query,
                                "images": images,
                                "user": user
                            });
                        });
                    });
                } else {
                    result.render("/login");
                }
            });

            //upload image in nodejs and save path in mongoDB
            app.post("/upload-image", async function(request, result) {
                if (request.session.user_id) {
                    var formData = new formidable.IncomingForm();
                    formData.maxFileSize = 1024 * 1024 * 1024;

                    formData.parse(request, function(error1, fields, files) {
                        var oldPath = files.image.filepath;
                        var newPath = "public/uploads/" + new Date().getTime() + "-" + files.image.name;

                        fileSystem.rename(oldPath, newPath, function(error2) {
                            getUser(request.session.user_id, function(user) {
                                delete user.password;
                                var currentTime = new Date().getTime();

                                database.collection("images").insertOne({
                                    "filePath": newPath,
                                    "user": user,
                                    "createdAt": currentTime,
                                    "likers": [],
                                    "comments": []
                                }, function(error2, data) {
                                    result.redirect("/?message=image_uploaded");
                                });
                            });
                        });
                    });
                } else {
                    result.redirect("/login");
                }
            });

            //view detail of an image
            app.get("/view-image", function(request, result) {
                database.collection("images").findOne({
                    "_id": ObjectId(request.query._id)
                }, function(error1, image) {
                    if (request.session.user_id) {
                        getUser(request.session.user_id, function(user) {
                            result.render("view-image", {
                                "isLogin": true,
                                "query": request.query,
                                "image": image,
                                "user": user
                            });
                        });
                    } else {
                        result.render("view-image", {
                            "isLogin": false,
                            "query": request.query,
                            "image": image
                        });
                    }
                });
            });

            app.post("/do-like", function(request, result) {
                if (request.session.user_id) {
                    database.collection("images").findOne({
                        "_id": ObjectId(request.body._id),
                        "likers._id": request.session.user_id
                    }, function(error1, video) {
                        if (video == null) {
                            database.collection("images").updateOne({
                                "_id": ObjectId(request.body._id)
                            }, {
                                $push: {
                                    "likers": {
                                        "_id": request.session.user_id
                                    }
                                }
                            }, function(error2, data) {
                                result.json({
                                    "status": "success",
                                    "message": "Image has been liked"
                                });
                            });
                        } else {
                            result.json({
                                "status": "error",
                                "message": "You have already liked this image."
                            });
                        }
                    });
                } else {
                    result.json({
                        "status": "error",
                        "message": "Please login to perform this action."
                    });
                }
            });

            app.post("/do-comment", function(request, result) {
                if (request.session.user_id) {
                    var comment = request.body.comment;
                    var _id = request.body._id;

                    getUser(request.session.user_id, function(user) {
                        delete user.password;

                        database.collection("images").findOneAndUpdate({
                            "_id": ObjectId(_id)
                        }, {
                            $push: {
                                "comments": {
                                    "_id": ObjectId(),
                                    "user": user,
                                    "comment": comment,
                                    "createdAt": new Date().getTime()
                                }
                            }
                        }, function(error1, data) {
                            result.redirect("/view-image?_id=" + _id + "&message=success#comments");
                        });
                    });
                } else {
                    result.redirect("/view-image?_id=" + _id + "&error=not_login#comments");
                }
            });

        });
});