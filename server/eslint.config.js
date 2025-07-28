module.exports = [
    {
        languageOptions: {
            globals: {
                ...require('globals').node,
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly'
            },
            ecmaVersion: 2021,
            sourceType: 'commonjs'
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single']
        }
    }
];