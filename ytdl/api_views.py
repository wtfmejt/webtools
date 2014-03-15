import json

from django.http import HttpResponse
from django.shortcuts import render_to_response, get_object_or_404
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger

import ytdl.tasks
from ytdl.models import Video, Channel


def _channel_info_dict(c):
    return {
        'id': c.id,
        'title': c.title,
        'service': c.service,
        'id': c.id,
        'icon': c.icon_url,
    }

def test(request):
    return render_to_response("ytdl/api_test.html")


def list_channels(request):
    page = int(request.GET.get("page", "1"))
    count = request.GET.get("count")

    def offset(sliceable, page, count):
        start = (page - 1) * count
        end = page * count
        return sliceable[start:end]

    query = Channel.objects.order_by('title').all()
    if count is not None:
        count = int(count)
        query = offset(query, page, count)

    channels = []
    for c in query:
        channels.append(_channel_info_dict(c))
    return HttpResponse(json.dumps({'channels': channels, 'total': Channel.objects.all().count()}))


def channel_details(request, chanid):
    if chanid == "all":
        query = Video.objects.all()
    else:
        chan = Channel.objects.get(id=chanid)
        query = Video.objects.all().filter(channel = chan)

    query = query.order_by('publishdate').reverse()

    # 25 videos per page, with no less than 5 per page
    paginator = Paginator(query, per_page=25, orphans=5)

    # Get page parameter
    page_num = request.GET.get('page', '1')
    if int(page_num) < 1:
        page_num = 1

    try:
        page = paginator.page(page_num)
    except PageNotAnInteger:
        page = paginator.page(1)
    except EmptyPage:
        page = paginator.page(paginator.num_pages)

    out_videos = []
    for v in page:
        out_videos.append({
            'id': v.id,
            'title': v.title,
            'imgs': v.img,
            'url': v.url,
            'description': v.description,
            'publishdate': str(v.publishdate),
            'status': v.status,
            # FIXME: Data duplication, only used for "all" channel view
            'channel': _channel_info_dict(v.channel),
        })

    if chanid == 'all':
        channel = None
    else:
        channel = _channel_info_dict(chan)

    page_info = {
        'total': paginator.num_pages,
        'current': page.number,
        'has_next': page.has_next(),
        'has_previous': page.has_previous(),
        }

    return HttpResponse(json.dumps(
        {'channel': channel,
         'videos': out_videos,
         'pagination': page_info}))



def grab(request, videoid):
    """For a given video ID, enqueue the task to download it
    """

    video = get_object_or_404(Video, id=videoid)

    force = request.REQUEST.get("force", "false").lower() == "true"

    grabbable = video.status in [Video.STATE_NEW, Video.STATE_GRAB_ERROR]
    if not grabbable and not force:
        ret = {"error": "Already grabbed (status %s)" % (video.status)}
        return HttpResponse(json.dumps(ret), status=500)

    video.status = Video.STATE_QUEUED
    video.save()

    ytdl.tasks.grab_video.delay(video.id, force=force)
    return HttpResponse(json.dumps({"status": video.status}))

# Set status

def _set_status(videoid, status):
    video = get_object_or_404(Video, id=videoid)
    video.status = status
    video.save()
    return HttpResponse(json.dumps({"status": video.status}))


def mark_viewed(request, videoid):
    return _set_status(videoid, Video.STATE_GRABBED)


def mark_ignored(request, videoid):
    return _set_status(videoid, status=Video.STATE_IGNORE)


# Query status

def video_status(request):
    ids = request.GET.get("ids")
    if ids is None:
        return HttpResponse("{}")

    ids = ids.split(",")
    videos = {}
    for cur in ids:
        v = get_object_or_404(Video, id=cur)
        videos[int(cur)] = v.status

    return HttpResponse(json.dumps(videos))