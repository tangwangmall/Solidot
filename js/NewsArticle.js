import React, { Component } from 'react';
import {
    StyleSheet,
    Text,
    View,
    Image,
    TouchableWithoutFeedback,
    RefreshControl,
    ScrollView,
} from 'react-native';
import api from './api.js';
import Cheerio from 'cheerio';
import ActualImage from './ActualImage.js';

export default class NewsArticle extends Component {

    constructor(props) {
        super(props);
        this.tmpReplyCount = 0;
        this.state = {
            dataArticle : props.data,
            refreshing : false,
        };
    }

    componentDidMount() {
        this._onRefresh();
    }

    _parseHtml(html) {
        var $ = Cheerio.load(html);
        var article = {
            ...this.state.dataArticle,
            content : '',
            viewCount : 0,
            imgs : [],
            aHrefs : [],
            replys : null, // []
        };

        var $ = Cheerio.load(html);
        var $article = $('article');
        $article.find('span').remove();
        $article.find('h2').remove();
        $article.find('br').remove();
        $article.find('p').each((index, item_p)=>{
            let p_str = $(item_p).text();
            if (!p_str) {
                p_str = '';
            }
            if (p_str.startsWith('本文已被查看')) {
                let viewCount = p_str.replace('本文已被查看','').replace('次','').trim();
                article.viewCount = viewCount;
                //console.log('viewCount=%d', viewCount);
                $(item_p).remove(); // 清空'本文已被查看 n 次'
            }
        });

        $article.find('img').each((index, item_img)=>{
            let $item_img = $(item_img);
            let src = $item_img.attr('src');
            article.imgs.push({img : src});
            //console.log('index=%s src=%s', index, src);
        });

        article.content = $article.text().replace(/(\r|\n)/g, '').trim();
        var seekTo = 0;
        $article.find('a').each((index, item_a)=>{
            let $item_a = $(item_a);
            let str = $item_a.text();
            let href = $item_a.attr('href');

            let preContent = this._cutContent(article.content, seekTo, str);

            seekTo = seekTo + preContent.length + str.length;
            article.aHrefs.push({txt : preContent});
            article.aHrefs.push({txt : str, href : href});
            //console.log('index=%s str=%s href=%s', index, str, href);
        });

        if (seekTo < article.content.length) {
            let endContent = article.content.substr(seekTo);
            //console.log('end=[%s]', endContent);
            article.aHrefs.push({txt : endContent});
        }


        // 处理评论
        // 判断是否有评论
        var $replyUL = $('ul.reply_ul');
        if ($replyUL.length == 1) {
            // 存在评论区
            // console.log('exist comment');
            var arrReply = [];
            this.tmpReplyCount = 0;
            this._parseReplyUL($, $replyUL, arrReply);
            article.replys = arrReply;
            article.comment = this.tmpReplyCount;

            // console.log('---- -----');
            // console.log(JSON.stringify(arrReply));
        } else {
            //console.log('no comment');
            article.replys = []; // 空数据
        }

        this.setState({
            dataArticle: article,
            refreshing : false,// 取消转圈
        });
        // console.log(JSON.stringify(article));
    }

    _parseReplyUL($, $reply, arrReply) {
        $reply.children().each((index, item_li) => {
            let $li = $(item_li);
            let li_id = $li.attr('id').replace('tree_', '');
            //console.log('index=%s comment_id=%s', index, li_id);
            $li.children().each((index, item) => {
                let $item = $(item);
                if ($item.is('p')) {
                    this._parseReply_p($, $item, li_id, arrReply);
                } else {
                    this._parseReplyNested($, $item, li_id, arrReply);
                }
            });
        });
    }
    _parseReply_p($, $item, id, arrReply) {
        // 单条评论
        let content = '';
        let user = '';
        let time = '';
        $item.children().each((index, item) => {
            let tmp = $(item).text().replace(/(\ |\t|\n|\r)/g, '');
            if (index == 0) {
                content = tmp;
            } else if (index == 1) {
                user = tmp;
            } else if (index == 2) {
                time = tmp;
            }
        });
        // console.log('content=[%s] user=[%s] time=[%s]', content, user, time);
        let reply_item = {id : id, user : user, time : time, content : content};
        arrReply.push(reply_item);
        this.tmpReplyCount ++;
    }

    _parseReplyNested($, $item, id, arrReply) {
        if ($item.is('div')) {
            let title = $item.find('h5').text();
            let content = $item.find('div.p_text').text().replace(/(\r|\n)/g, '').trim();
            let user = '';
            let time = '';

            $item.find('div.talk_time').find('span').each((index, item)=>{
                let $span = $(item);
                let tmp = $span.text().replace(/(\r|\n)/g, '').trim();
                if (index == 0) {
                    user = tmp;
                } else if (index == 1) {
                    time = tmp.replace('发表于', '');
                }
            });

            // console.log('title=[%s] content=[%s] usr=[%s] time=[%s]', title, content, user, time);
            let replyNested = {
                id: id,
                title: title,
                content: content,
                user: user,
                time: time,
            };
            arrReply.push(replyNested);
            this.tmpReplyCount ++;
        } else if ($item.is('ul')) {
            var idx = Math.max(0, arrReply.length -1);
            if (!arrReply[idx].nested) {
                // 不存在，就生成一个
                arrReply[idx].nested = [];
            }
            this._parseReplyUL($, $item, arrReply[idx].nested);
        }
    }

    _onRefresh() {
        this.setState({refreshing: true});

        var url = api.Article + this.state.dataArticle.sid;
        //var url = api.Article + '49839';

        var headers = new Headers();
        headers.append('User-Agent', '(Android)');
        // Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8
        headers.append('Accept-Encoding', 'deflate');
        headers.append('Accept-Language', 'zh-CN,zh;q=0.8');
        var request = new Request(url, {method :'GET', headers: headers});

        fetch(request)
            .then((response)=>{
                return response.text();
            })
            .then((html)=>{
                this._parseHtml(html);
            })
            .catch((error)=>{
                //console.log('NewsAritcle::_onRefresh() error=%s', error);
            }).done();
    }

    _cutContent(content, seekTo, keyEnd) {
        var idxKey = content.indexOf(keyEnd, seekTo);
        var preContent = content.substr(seekTo, idxKey - seekTo);
        // console.log('seekTo=%s idxKey=%s pre=[%s] key=[%s]', seekTo, idxKey, preContent, keyEnd);
        return preContent;
    }

    _assembleArticleContent(article) {
        var arrTxt = [];
        if (!article.content) {
            // 还没有获取到内容
            arrTxt.push(this._newText(article.description));
        } else {
            var content = article.content;
            var aHrefs = article.aHrefs;
            var seekTo = 0;

            aHrefs.forEach((href, index, aHrefs) => {
                var txt = href.txt;
                var href = href.href;

                arrTxt.push(this._newText(txt, href));
            });
        }

        return (
            <Text key={arrTxt} style={{flex : 1, justifyContent : 'flex-start', margin : 8}}>
                {arrTxt}
            </Text>
        );
    }

    _newText(strText, href) {
        if (!href) {
            // 普通文本
            return (<Text key={strText}>{strText}</Text>);
        } else {
            // 带超链接的文本，需要处理点击事件
            return (<Text style={{textDecorationLine: 'underline'}}
                        key={strText}
                        onPress={()=>{
                            this._jumpToWeb(href);
                        }}>
                            {strText}
                        </Text>);
        }
    }

    _jumpToWeb(href) {
        this.props.navigator.push({
            id: 'web',
            url: href,
            title: 'Referer URL',
        });
    }

    _assembleArticleImage(article) {
        if (!article.imgs) {
            return null;
        }
        if (article.imgs.length == 0) {
            return null;
        }

        var images = [];
        article.imgs.forEach((objImg, index, imgs) => {
            images.push(
              <ActualImage key={objImg} source={{uri : objImg.img}}/>
            );
        });

        return (<View style={{justifyContent:'center', alignItems:'center', margin : 8}}>{images}</View>);
    }

    _assembleArticleHead(article) {
        var heads = [];
        heads.push(
            <View style={styles.container}
                key={article.tag}>
                <Text style={styles.articleTag}
                      key={this.state.dataArticle.tag}>
                    {this.state.dataArticle.tag}
                </Text>
                <Text style={styles.articleTime}
                      key={this.state.dataArticle.time}>
                    {this.state.dataArticle.time}
                </Text>
            </View>
        );
        heads.push(
            <Text style={styles.articleTitle}
                  key={this.state.dataArticle.title}>
                {this.state.dataArticle.title}
            </Text>
        );
        return heads;
    }

    _assembleArticleViewCount(viewCount) {
        if (!viewCount) {
            return null;
        }


        if (viewCount <= 0) {
            viewCount = 1;
        }

        return (
            <Text style={{textAlign: 'right', marginRight : 5}}>本文已被查看{viewCount}次</Text>
        );
    }

    _assembleArticleReplySeparatorLine(article) {
        if (!article.viewCount) {
            // 还没有拉取数据成功，则不显示分隔线
            return null;
        } else {
            return (
                <View style={styles.separator}></View>
            );
        }
    }

    _assembleArticleReplyHead(article) {
        if (article.replys == null) {
            // 还没拉取到
            return null;
        }

        if (article.replys.length > 0) {
            // 有回复数
            var arr = [];

            arr.push(
                <View style={{flexDirection: 'row', justifyContent : 'space-between'}}
                    key={article.comment}>
                    <Text style={{marginLeft : 5, fontSize : 20, fontWeight : 'bold'}}>回复</Text>
                    <Text style={{marginRight : 5, textAlign: 'center'}}><Text style={{fontSize : 20, fontWeight : 'bold'}}>{article.comment}</Text>条评论</Text>
                </View>
            );

            arr.push(
                <Text style={{margin : 5, textAlign: 'center', color : 'white', backgroundColor : '#797979'}}
                    key={'statement'}>
                    <Text style={{fontFamily: 'serif', fontWeight: 'bold'}}>声明: </Text>
                    下面的评论属于其发表者所有，不代表本站的观点和立场，我们不负责他们说什么。
                </Text>
            )

            return arr;
        } else {
            // 还没有回复
            // 只显示一个‘回复’
            return (
                <Text style={{marginLeft : 5, fontSize : 20, fontWeight : 'bold'}}>回复</Text>
            );
        }
    }

    _assembleArticleReplyList(replys, vArray) {
        if (!replys || replys.length == 0) {
            return null;
        }

        replys.forEach((reply, index, replys) => {

        });
    }

    render() {
        var articleHeads = this._assembleArticleHead(this.state.dataArticle);
        var imgContainer = this._assembleArticleImage(this.state.dataArticle);
        var txtContainer = this._assembleArticleContent(this.state.dataArticle);
        var txtViewCount = this._assembleArticleViewCount(this.state.dataArticle.viewCount);
        var vSeparator = this._assembleArticleReplySeparatorLine(this.state.dataArticle);
        var vReplyHead = this._assembleArticleReplyHead(this.state.dataArticle);
        var vReplyList = [];
        vReplyList = this._assembleArticleReplyList(this.state.dataArticle.replys, vReplyList);
        // TouchableWithoutFeedback没有width height backgroundColor等属性，真难用
        // onPress直接赋值为navigator.pop，也可以写个函数执行()=>{pop}
        return (
            <View style={styles.articleContainer}>
                <View style={{height : 56, flexDirection : 'row', backgroundColor : '#015351', alignItems : 'center', justifyContent:'center'}}>
                    <TouchableWithoutFeedback onPress={this.props.navigator.pop}>
                        <Image source={require('image!back_white_24dp')}
                               style={{width : 35, height : 35, alignSelf : 'center', position : 'absolute', left : 5, top : 10}}
                        ></Image>
                    </TouchableWithoutFeedback>
                    <Image source={{uri : 'title'}} style={{width : 175, height : 35}}></Image>
                </View>
                <ScrollView style={{flex : 1}}
                            enableEmptySections = {true}
                            refreshControl={
                                <RefreshControl refreshing={this.state.refreshing}
                                onRefresh={this._onRefresh.bind(this)}/>
                            }>
                    {articleHeads}
                    {imgContainer}
                    {txtContainer}
                    {txtViewCount}
                    {vSeparator}
                    {vReplyHead}
                    {vReplyList}
                </ScrollView>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    title: {
        width : 200,
        height : 40,
    },
    articleTitle : {
        flexDirection : 'row',
        backgroundColor : '#015351',
    },
    articleTitleText : {
        color : 'white',
        fontSize : 20,
    },
    toolbar: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#015351',
        height: 56,
    },
    container: {
        justifyContent: 'flex-start',
        alignItems: 'center',
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding : 5,
    },
    articleTag : {
        backgroundColor : '#015351',
        color : 'white',
        marginLeft : 5,
        marginRight : 5,
    },
    articleTime : {
        backgroundColor : '#3a92d9',
        color : 'white',
        marginLeft : 5,
        marginRight : 5,
    },
    articleTitle : {
        color : '#48535b',
        fontSize : 20,
        paddingTop : 2.5,
        paddingBottom : 2.5,
        paddingLeft : 5,
        paddingRight : 5,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#015351',
        marginLeft : 5,
        marginRight : 5,
    },
});