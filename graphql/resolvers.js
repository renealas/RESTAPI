const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const Post = require('../models/post');
const { clearImage } = require('../util/file');
const { createPost } = require('../controllers/feed');

module.exports = {
    createUser: async function ({ userInput }, req) {
        //const email = args.userInput.email;
        const errors = [];
        if (!validator.isEmail(userInput.email)) {
            errors.push({ message: 'Correo no es Valido' });
        }
        if (
            validator.isEmpty(userInput.password) ||
            !validator.isLength(userInput.password, { min: 5 })
        ) {
            errors.push({ message: 'Contraseña muy Corta' });
        }
        if (errors.length > 0) {
            const error = new Error('Valores Entrados Invalidos');
            error.data = errors;
            error.code = 422;
            throw error;
        }
        const existingUser = await User.findOne({ email: userInput.email });
        if (existingUser) {
            const error = new Error('Usuario ya Existe!');
            throw error;
        }
        const hasshedPw = await bcrypt.hash(userInput.password, 12);
        const user = new User({
            email: userInput.email,
            name: userInput.name,
            password: hasshedPw
        });
        const createdUser = await user.save();
        return { ...createdUser._doc, _id: createdUser._id.toString() };
    },

    login: async function ({ email, password }) {
        const user = await User.findOne({ email: email });
        if (!user) {
            const error = new Error('Usuario no encontrado');
            error.code = 401;
            throw error;
        }
        const isEqual = await bcrypt.compare(password, user.password);
        if (!isEqual) {
            const error = new Error('Contraseña es incorrecta');
            error.code = 401;
            throw error;
        }
        const token = jwt.sign({
            userId: user._id.toString(),
            email: user.email
        },
            'somesupersecretsecret',
            { expiresIn: '1h' }
        );
        return { token: token, userId: user._id.toString() };
    },

    createPost: async function({ postInput }, req) {
        if(!req.userId){
            req.userId = '60089329d2410e53a4c55b94';
        }
        if (!req.isAuth) {
          const error = new Error('No Autenticado!');
          error.code = 401;
          throw error;
        }
        const errors = [];
        if (
          validator.isEmpty(postInput.title) ||
          !validator.isLength(postInput.title, { min: 5 })
        ) {
          errors.push({ message: 'Titulo es no valido.' });
        }
        if (
          validator.isEmpty(postInput.content) ||
          !validator.isLength(postInput.content, { min: 5 })
        ) {
          errors.push({ message: 'Contenido es no valido.' });
        }
        if (errors.length > 0) {
          const error = new Error('Contenido Invalido.');
          error.data = errors;
          error.code = 422;
          throw error;
        }
        const user = await User.findById(req.userId);
        if (!user) {
          const error = new Error('Usuario Invalido.');
          error.code = 401;
          throw error;
        }
        const post = new Post({
          title: postInput.title,
          content: postInput.content,
          imageUrl: postInput.imageUrl,
          creator: user
        });
        const createdPost = await post.save();
        user.posts.push(createdPost);
        await user.save();
        return {
          ...createdPost._doc,
          _id: createdPost._id.toString(),
          createdAt: createdPost.createdAt.toISOString(),
          updatedAt: createdPost.updatedAt.toISOString()
        };
      },

      posts: async function({ page }, req) {
        if (!req.isAuth) {
          const error = new Error('Usuario No Autenticado!');
          error.code = 401;
          throw error;
        }
        if (!page) {
          page = 1;
        }
        const perPage = 2;
        const totalPosts = await Post.find().countDocuments();
        const posts = await Post.find()
          .sort({ createdAt: -1 })
          .skip((page - 1) * perPage)
          .limit(perPage)
          .populate('creator');
        return {
          posts: posts.map(p => {
            return {
              ...p._doc,
              _id: p._id.toString(),
              createdAt: p.createdAt.toISOString(),
              updatedAt: p.updatedAt.toISOString()
            };
          }),
          totalPosts: totalPosts
        };
      },

    post: async function ({ id }, req) {
        if (!req.isAuth) {
            const error = new Error('Usuario No Autneticado!');
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if (!post) {
            const error = new Error('No Encontramos Articulo!');
            error.code = 404;
            throw error;
        }
        const len = post.imageUrl.length;
        const res = post.imageUrl.slice(8, len);
        console.log(res);
        return {
            ...post._doc,
            _id: post._id.toString(),
            //imageUrl: res,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        }
    },

    updatePost: async function({id, postInput}, req){
        if (!req.isAuth) {
            const error = new Error('Usuario No Autneticado!');
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if (!post) {
            const error = new Error('No Encontramos Articulo!');
            error.code = 404;
            throw error;
        }
        if (post.creator._id.toString() !== req.userId.toString()){
            const error = new Error('No tiene Autorizacion');
            error.code = 403;
            throw error;
        }
        const errors = [];
        if (
          validator.isEmpty(postInput.title) ||
          !validator.isLength(postInput.title, { min: 5 })
        ) {
          errors.push({ message: 'Titulo es no valido.' });
        }
        if (
          validator.isEmpty(postInput.content) ||
          !validator.isLength(postInput.content, { min: 5 })
        ) {
          errors.push({ message: 'Contenido es no valido.' });
        }
        if (errors.length > 0) {
          const error = new Error('Contenido Invalido.');
          error.data = errors;
          error.code = 422;
          throw error;
        }
        post.title = postInput.title;
        post.content = postInput.content;
        if (postInput.imageUrl !== 'undefined'){
            post.imageUrl = postInput.imageUrl;
        }
        const updatedPost = await post.save();
        return {
            ...updatedPost._doc, 
            _id: updatedPost._id.toString(), 
            createdAt: updatedPost.createdAt.toISOString(),
            updatedAt: updatedPost.updatedAt.toISOString()
        };
    },

    deletePost: async function({id}, req){
        if (!req.isAuth) {
            const error = new Error('Usuario No Autneticado!');
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id);
        if (!post) {
            const error = new Error('No Encontramos Articulo!');
            error.code = 404;
            throw error;
        }
        if (post.creator.toString() !== req.userId.toString()){
            const error = new Error('No tiene Autorizacion');
            error.code = 403;
            throw error;
        }
        clearImage(post.imageUrl);
        await Post.findByIdAndRemove(id);
        const user = await User.findById(req.userId);
        user.posts.pull(id);
        await user.save();
        return true;
    },

    user: async function (args, req) {
        if (!req.isAuth) {
            const error = new Error('Usuario No Autneticado!');
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if(!user){
            const error = new Error('Usuario no Encontrado!');
            error.code = 404;
            throw error;
        }
        return {...user._doc, _id: user._id.toString()}
    },

    updateStatus: async function({status}, req){
        if (!req.isAuth) {
            const error = new Error('Usuario No Autneticado!');
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if(!user){
            const error = new Error('Usuario no Encontrado!');
            error.code = 404;
            throw error;
        }
        user.status = status;
        await user.save();
        return {...user._doc, _id: user._id.toString()};
    }
};