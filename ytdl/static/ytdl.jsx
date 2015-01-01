function _do_video_action(video_id, name, force){
    if(typeof(force) === 'undefined'){
        force=false;
    }

    console.log("Doing action", name, "for id", video_id, "forcefully", force);

    // Call grab method of API
    $.get("/youtube/api/1/video/" + video_id + "/" + name + "?force=" + force)
        .success(function(data){
            console.log("Initatised grab", data);
            data.status;
        }).error(function(data){
            console.log("Error initating grab", data);
            if(data.error){
                // TODO: Less annoying popup, allow force download
                if(confirm(data.error + "\n" + "Forcefully try again?")){
                    _do_video_action(video, name, true); // force
                }
            }
        });
}



var VideoActions = React.createClass({
    download: function(e){
        e.preventDefault();
        console.log("Download " + this.props.videoid);
        _do_video_action(this.props.videoid, 'grab');
    },
    ignore: function(e){
        e.preventDefault();
        _do_video_action(this.props.videoid, 'mark_ignored');
    },
    render: function(){
        return (<span>
                <a href="#" onClick={this.download}>DL</a>
                <a href="#" onClick={this.ignore}>IG</a>
                </span>);
    },
});

var VideoInfo = React.createClass({
    getInitialState: function(){
        return {};
    },
    humanName: function(status){
        return {
            NE: "new",
            GR: "grabbed",
            QU: "queued",
            DL: "downloading",
            GE: "grab error",
            IG: "ignored",
        }[status] || status;
    },
    cssClass: function(status){
        return {
            NE: "new",
            GR: "grabbed",
            QU: "queued",
            DL: "downloading",
            GE: "error",
            IG: "ignored",
        }[status] || status;
    },
    render: function(){
        return (
            <tr className={this.cssClass(this.props.data.status)}>
                <td><VideoActions videoid={this.props.data.id} video={this} /></td>
                <td>
                  <img width="16" height="16" src={this.props.data.channel.icon} /> {this.props.data.title}
                </td>
                <td><img width="16" height="16" src={this.props.data.channel.icon} /> {this.props.data.channel.title}</td>
                <td>{this.humanName(this.props.data.status)}</td>
            </tr>
        );
    }
});

var NavigationLinks = React.createClass({
    getInitialState: function() {
        return {
            page: 1
        };
    },
    componentDidMount: function() {
        that=this;
        Mousetrap.bind('n', function() { that.next(); });
        Mousetrap.bind('p', function() { that.prev(); });
    },
    setPage: function(pagenum){
        pagenum = Math.max(1, pagenum); // Clamp to positive
        console.log("Naviging to page " + pagenum)
        this.setState({page: pagenum});
        if(this.props.cbPageChanged){
            this.props.cbPageChanged(pagenum);
        }
    },
    render: function(){
        return (
            <div>
                Page {this.props.data && this.props.data.current} of {this.props.data && this.props.data.total}<br />
                <a href="#" onClick={this.prev}>Back</a> <a href="#" onClick={this.next}>Next</a>
            </div>
            );
    },
    prev: function(e){
        console.log("Previous!")
        this.setPage(this.state.page-1);
        if(e){
            e.preventDefault();
        }
    },
    next: function(e){
        console.log("Next!")
        this.setPage(this.state.page+1);
        if(e){
            e.preventDefault();
        }
    },
})

var VideoList = React.createClass({
    getInitialState: function(){
        return {data: {videos: []}};
    },
    componentDidMount: function(){
        this.loadPage(1);
        this.timer = setInterval(this.tick, 1000);
    },

    componentWillUnmount: function() {
        clearInterval(this.timer);
    },

    tick: function(){
        // Collect up IDs for videos visible on current page
        var ids = [];
        this.state.data.videos.forEach(function(v){
            ids.push(v.id);
        });

        self = this;

        // Query statues
        var status_query = $.ajax(
            {url:"/youtube/api/1/video_status?ids=" + ids.join(),
             dataType: 'json'}
        );

        status_query.error(function(data){
            console.log("Error querying status");
        });

        status_query.success(function(data){
            // TODO: Make this simpler/tidier
            var newvideos = self.state.data.videos.map(function(v, index){

                if(data[v.id]){
                    return React.addons.update(v, {status: {$set: data[v.id]}});
                }
            });
            var newdata = React.addons.update(self.state.data, {videos: {$set: newvideos}});
            self.setState({data: newdata});
            /*
              self.state.data.videos.forEach(function(v, index){
              if(data[v.id]){
              self.state.data.videos[index].status = data[v.id];
              }
              });
            */
        });
    },

    loadPage: function(pagenum){
        $.ajax({
            url: "/youtube/api/1/channels/"+this.props.channel+"?page="+pagenum,
            dataType: "json",
            success: function(data) {
                console.log("Got data!", data)
                this.setState({data: data});
            }.bind(this),
            error: function(xhr, textStatus){
                console.error("Error loading page (" + textStatus + ")");
            }
        });
    },

    render: function(){
        var items = this.state.data.videos.map(function(f){
            return (<VideoInfo key={f.id} data={f} />);
        });
        return (
            <div>
                <NavigationLinks data={this.state.data.pagination} cbPageChanged={this.loadPage}/>
                <table>
                {items}
                </table>
                <NavigationLinks data={this.state.data.pagination} cbPageChanged={this.loadPage}/>
                {JSON.stringify(this.state.data.pagination)}
            </div>
            );
    }
});


var ChannelList = React.createClass({
    getInitialState: function(){
        return {data: {channels: []},
                is_loaded: false};
    },
    componentDidMount: function(){
        this.load();
    },
    load: function(){
        $.ajax({
            url: "/youtube/api/1/channels",
            dataType: "json",
            success: function(data) {
                console.log("Got data!", data)
                if(this.isMounted()){
                    this.setState({data: data, is_loaded: true});
                }
            }.bind(this),
            error: function(xhr, textStatus){
                console.error("Error loading page (" + textStatus + ")");
            }.bind(this)
        });
    },

    render: function(){
        if(!this.state.is_loaded){
            return(<div>Loading!</div>)
        }
        var things = this.state.data.channels.map(function(f){
            return (<tr key={f.id}>
                      <td>
                        <img src={f.icon} width="16" height="16" /> <a href={"#/channels/"+f.id}>{f.title || "Untitled channel (refreshing?)"}</a>
                      </td>
                      <td>
                      </td>
                    </tr>);
        });
        return (
                <div>
                <tr>
                  <td><a href="#/channels/_all">All channels</a></td>
                </tr>
                {things}
                </div>
        );
    },
});

var ChannelAdd = React.createClass({
    getInitialState: function(){
        return {channame: "", service: "youtube"};
    },
    handleChangeID: function(event){
        this.setState({chanid: event.target.value});
    },

    handleChangeService: function(event){
        this.setState({service: event.target.value});
    },

    submit: function(event){
        console.log("Go");
        var thing = $.ajax({
            url: "/youtube/api/1/channel_add",
            type: "POST",
            data: {"service": this.state.service,
                   "chanid": this.state.chanid}});
        thing.error(function(data){
            console.log("Error adding channel!");
        });
        thing.success(function(data){
            console.log("Done!");
        });
    },

    render: function(){
        return (<form onSubmit={this.submit}>
                  <input value={this.state.chanid} type="text" onChange={this.handleChangeID} />
                  <select value={this.state.service} onChange={this.handleChangeService}>
                    <option value="youtube">YouTube</option>
                    <option value="vimeo">Vimeo</option>
                  </select>
                  <input type="submit" />
                  <span>{this.state.chanid}</span>
                  <span>{this.state.service}</span>
                </form>);
    },
});

var PageNotFound = React.createClass({
    render: function(){
        return (
            <span>Unknown page</span>
        );
    },
});

var App = React.createClass({
    getInitialState: function(){
        return {component: <div />};
    },
    componentDidMount: function(){
        var self=this;

        var routes = {
            '/': function(){ self.setState({component: <ChannelList />}); },
            '/channels/:id': function(chanid){ self.setState({component: <VideoList key={chanid} channel={chanid} />}) },
            '/add': function(){ self.setState({component: <ChannelAdd />}); },
        };

        var router = Router(routes);
        router.init();
    },
    render: function(){
        console.log("App rendering", this.state.component);
        return this.state.component;
    },
});

React.render(<App />, document.getElementById("content"));